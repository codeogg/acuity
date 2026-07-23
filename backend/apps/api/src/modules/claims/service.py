"""医生端填报流程服务。所有查询强制 clinic_id 隔离。"""
import secrets
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.encryption import decrypt_text, encrypt_text
from src.core.exceptions import ConflictException, NotFoundException, ValidationException
from src.core.i18n import translate_message
from src.core.logging import get_logger
from src.db.models import (
    ClaimFieldChangeLog,
    ClaimSubmission,
    Clinic,
    ClinicInsuranceCompany,
    ClinicPolicyTemplate,
    Doctor,
    DocumentPage,
    ExtractionResult,
    ExtractionReviewOutput,
    ExtractionTask,
    InsuranceCompany,
    PolicyTemplate,
    StandardField,
    TemplateField,
    TemplateFieldMapping,
)
from src.modules.ai_extraction import service as ai_service
from src.modules.claims.schemas import (
    ClaimCreate,
    ClaimListItem,
    ClaimOut,
    ExtractProgressOut,
    ExtractProgressVisit,
    HomeOverview,
    HomeStats,
)
from src.modules.pdf_extraction import service as pdf_extraction_service
from src.modules.pdf_extraction.steps.step11_review_output import (
    merge_review_fields_for_display,
)
from src.modules.pdf_generation.fill_engine import generate_filled_pdf
from src.tasks.extraction_progress import (
    clear_extraction_progress_cached,
    get_extraction_progress_cached,
)
from src.tasks.queue import abort_arq_job, enqueue_extraction_pipeline
from src.utils import storage

logger = get_logger(__name__)

_HK = ZoneInfo("Asia/Hong_Kong")

_STATUS_LABELS = {
    "DRAFT": "claim.status.draft",
    "AI_FILLED": "claim.status.ai_filled",
    "CONFIRMED": "claim.status.confirmed",
    "PRINTED": "claim.status.printed",
    "CANCELLED": "claim.status.cancelled",
}

# 状态机允许的迁移
_ALLOWED_TRANSITIONS = {
    "DRAFT": {"AI_FILLED", "CANCELLED"},
    "AI_FILLED": {"DRAFT", "AI_FILLED", "CONFIRMED", "CANCELLED"},
    # CONFIRMED → DRAFT：核对页「重新上载病历」需退回草稿重跑提取
    "CONFIRMED": {"AI_FILLED", "CONFIRMED", "PRINTED", "CANCELLED", "DRAFT"},
    "PRINTED": {"CANCELLED"},
    "CANCELLED": set(),
}


def _flatten_field_values(values: dict | None) -> dict[str, str | None]:
    """将 final_field_values 收敛为扁平 {field_code: value}，兼容富状态结构。"""
    if not values:
        return {}
    flat: dict[str, str | None] = {}
    for code, raw in values.items():
        if isinstance(raw, dict) and "value" in raw:
            val = raw.get("value")
            flat[code] = None if val is None else str(val)
        elif raw is None:
            flat[code] = None
        else:
            flat[code] = str(raw)
    return flat


def _clean_patient_name(value: str | None) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def format_patient_display(
    patient_name_cn: str | None,
    patient_name_en: str | None,
    legacy: str | None = None,
) -> str | None:
    """列表/页脚展示：中英都有则「中文 / English」，否则取有值的一侧。"""
    cn = _clean_patient_name(patient_name_cn)
    en = _clean_patient_name(patient_name_en)
    if cn and en:
        return f"{cn} / {en}"
    return cn or en or _clean_patient_name(legacy)


def sync_claim_patient_names(
    claim: ClaimSubmission,
    *,
    values: dict | None = None,
) -> None:
    """从 final_field_values（或传入 values）同步绑定到 claim 的中英姓名列。"""
    flat = _flatten_field_values(values if values is not None else claim.final_field_values)
    if "patient_name_cn" in flat:
        claim.patient_name_cn = _clean_patient_name(flat.get("patient_name_cn"))
    if "patient_name_en" in flat:
        claim.patient_name_en = _clean_patient_name(flat.get("patient_name_en"))
    # 旧单字段回退：仅当中英都空时写入一侧
    legacy = _clean_patient_name(flat.get("patient_name"))
    if legacy and not claim.patient_name_cn and not claim.patient_name_en:
        # 含汉字 → cn，否则 → en
        if any("\u4e00" <= ch <= "\u9fff" for ch in legacy):
            claim.patient_name_cn = legacy
        else:
            claim.patient_name_en = legacy
    claim.patient_name = format_patient_display(
        claim.patient_name_cn,
        claim.patient_name_en,
        claim.patient_name,
    )


def _gen_submission_no() -> str:
    return f"SUB{datetime.now(UTC):%Y%m%d}{secrets.token_hex(3).upper()}"


def _ensure_transition(current: str, target: str) -> None:
    if target not in _ALLOWED_TRANSITIONS.get(current, set()):
        raise ValidationException(f"状态不允许从 {current} 变更为 {target}")


async def list_available_companies(
    db: AsyncSession, clinic_id: int
) -> list[InsuranceCompany]:
    stmt = (
        select(InsuranceCompany)
        .join(
            ClinicInsuranceCompany,
            ClinicInsuranceCompany.company_id == InsuranceCompany.id,
        )
        .where(
            ClinicInsuranceCompany.clinic_id == clinic_id,
            ClinicInsuranceCompany.status == 1,
            InsuranceCompany.status == 1,
        )
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_available_templates(
    db: AsyncSession, clinic_id: int, company_id: int
) -> list[PolicyTemplate]:
    """仅返回已发布(is_active) 且诊所已启用的模板。"""
    stmt = (
        select(PolicyTemplate)
        .join(
            ClinicPolicyTemplate,
            ClinicPolicyTemplate.template_id == PolicyTemplate.id,
        )
        .where(
            PolicyTemplate.company_id == company_id,
            PolicyTemplate.is_active.is_(True),
            ClinicPolicyTemplate.clinic_id == clinic_id,
            ClinicPolicyTemplate.status == 1,
        )
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_claim(
    db: AsyncSession, *, doctor_id: int, clinic_id: int, data: ClaimCreate
) -> ClaimSubmission:
    template = await db.get(PolicyTemplate, data.template_id)
    if not template or not template.is_active:
        raise ValidationException("模板不可用")
    claim = ClaimSubmission(
        submission_no=_gen_submission_no(),
        clinic_id=clinic_id,
        doctor_id=doctor_id,
        company_id=data.company_id,
        template_id=data.template_id,
        template_version=template.version,
        status="DRAFT",
    )
    db.add(claim)
    await db.flush()
    return claim


async def get_claim(db: AsyncSession, claim_id: int, clinic_id: int) -> ClaimSubmission:
    claim = await db.get(ClaimSubmission, claim_id)
    if not claim or claim.clinic_id != clinic_id:
        raise NotFoundException("填报记录不存在")  # 故意 404，不暴露资源存在性
    return claim


async def list_template_specific_ai_fields(
    db: AsyncSession, *, claim_id: int, clinic_id: int
) -> list[dict[str, str | None]]:
    """返回当前填报模板映射的「模板专属 AI 提取」字段，供核对页占位展示。"""
    claim = await get_claim(db, claim_id, clinic_id)
    specs = await pdf_extraction_service._load_template_specific_ai_fields(
        db, template_id=claim.template_id
    )
    active_codes = {
        code
        for code in (
            await db.execute(
                select(StandardField.field_code).where(StandardField.is_active.is_(True))
            )
        ).scalars().all()
    }
    return [
        {
            "field_code": spec.field_code,
            "field_name": spec.field_name,
            "ai_extraction_hint": spec.ai_extraction_hint,
        }
        for spec in specs
        if spec.field_code not in active_codes
    ]


async def get_extraction_task_no(
    db: AsyncSession, claim: ClaimSubmission
) -> str | None:
    if not claim.extraction_task_id:
        return None
    task = await db.get(ExtractionTask, claim.extraction_task_id)
    return task.task_no if task else None


async def _clear_claim_medical_extraction(
    db: AsyncSession, claim: ClaimSubmission
) -> None:
    """删除关联提取任务并清空病历提取相关字段。"""
    if claim.extraction_task_id is not None:
        task = await db.get(ExtractionTask, claim.extraction_task_id)
        if task:
            await db.delete(task)
        claim.extraction_task_id = None
    claim.ai_raw_result = None
    claim.final_field_values = None
    claim.ai_token_usage = None
    claim.ai_process_time_ms = None
    claim.extract_status = "IDLE"
    claim.extract_stage = None
    claim.extract_progress = 0
    claim.extract_message = None
    claim.extract_job_id = None
    claim.extract_manifest = None
    await clear_extraction_progress_cached(claim.id)
    await db.flush()


async def reset_medical_upload(
    db: AsyncSession, *, claim_id: int, clinic_id: int
) -> ClaimSubmission:
    """退回上传病历步骤：清空提取任务与已填字段，状态回到草稿。"""
    claim = await get_claim(db, claim_id, clinic_id)
    # AI 识别后为 AI_FILLED；点过「完成核对」后为 CONFIRMED——均允许重新上载
    if claim.status not in ("DRAFT", "AI_FILLED", "CONFIRMED"):
        raise ValidationException("当前状态不可重新上传病历")

    await _clear_claim_medical_extraction(db, claim)
    if claim.status in ("AI_FILLED", "CONFIRMED"):
        _ensure_transition(claim.status, "DRAFT")
        claim.status = "DRAFT"
    claim.field_confirmations = None
    claim.generated_pdf_url = None
    await db.commit()
    await db.refresh(claim)
    return claim


async def upload_medical_pdf(
    db: AsyncSession,
    *,
    claim_id: int,
    clinic_id: int,
    doctor_id: int,
    filename: str,
    file_bytes: bytes,
    patient_name: str | None = None,
) -> tuple[ClaimSubmission, ExtractionTask]:
    claim = await get_claim(db, claim_id, clinic_id)
    if claim.status != "DRAFT":
        raise ValidationException("仅草稿状态可上传病历 PDF")

    await _clear_claim_medical_extraction(db, claim)

    upload_result = await pdf_extraction_service.create_upload_task(
        db,
        clinic_id=clinic_id,
        doctor_id=doctor_id,
        filename=filename,
        file_bytes=file_bytes,
        patient_name=patient_name or claim.patient_name,
    )
    task = (
        await db.execute(
            select(ExtractionTask).where(ExtractionTask.task_no == upload_result.task_id)
        )
    ).scalar_one()

    claim.extraction_task_id = task.id
    if patient_name:
        claim.patient_name = patient_name
    elif upload_result.patient_name:
        claim.patient_name = upload_result.patient_name
    await db.commit()
    await db.refresh(claim)
    await db.refresh(task)
    return claim, task


def _manifest_visits(manifest: dict | None) -> list[dict]:
    if not manifest:
        return []
    visits = manifest.get("visits")
    return visits if isinstance(visits, list) else []


def _progress_from_claim(claim: ClaimSubmission) -> ExtractProgressOut:
    visits_out = None
    if claim.extract_status == "AWAITING_INPUT":
        visits_out = [
            ExtractProgressVisit(
                visit_index=int(v.get("visit_index", 0)),
                visit_date=v.get("visit_date"),
                summary=v.get("summary"),
                page_range=v.get("page_range") or [],
                selected=bool(v.get("selected")),
            )
            for v in _manifest_visits(claim.extract_manifest)
        ]
    return ExtractProgressOut(
        stage=claim.extract_stage or "IDLE",
        percent=int(claim.extract_progress or 0),
        message=claim.extract_message,
        status=claim.extract_status or "IDLE",
        visits=visits_out,
    )


async def get_extract_progress(
    db: AsyncSession, *, claim_id: int, clinic_id: int
) -> ExtractProgressOut:
    claim = await get_claim(db, claim_id, clinic_id)
    if not claim.extraction_task_id:
        return ExtractProgressOut(
            stage="IDLE", percent=0, message="请先上传病历 PDF", status="IDLE"
        )
    cached = await get_extraction_progress_cached(claim_id)
    if cached and claim.extract_status in ("RUNNING", "QUEUED"):
        status = str(cached.get("status") or claim.extract_status)
        # 忽略终态/待输入残留缓存：重新入队或就诊续跑后 Redis 可能尚未被 worker 覆盖
        if status not in ("DONE", "FAILED", "AWAITING_INPUT"):
            return ExtractProgressOut(
                stage=str(cached.get("stage") or "INGEST"),
                percent=int(cached.get("percent") or 0),
                message=cached.get("message") or claim.extract_message,
                status=status,
                visits=None,
            )
    if claim.extract_status in ("IDLE", "QUEUED") and claim.extraction_task_id:
        task = await db.get(ExtractionTask, claim.extraction_task_id)
        if task and task.status == "REVIEW":
            return ExtractProgressOut(
                stage="DONE", percent=100, message="提取完成", status="DONE"
            )
    return _progress_from_claim(claim)


async def start_extract_from_pdf(
    db: AsyncSession, *, claim_id: int, clinic_id: int
) -> tuple[str | None, str]:
    claim = await get_claim(db, claim_id, clinic_id)
    if claim.status != "DRAFT":
        raise ValidationException("仅草稿状态可启动 PDF 提取")
    if not claim.extraction_task_id:
        raise ValidationException("请先上传病历 PDF")
    if claim.extract_status in ("RUNNING", "QUEUED"):
        raise ValidationException("提取任务正在执行中")

    claim.extract_status = "QUEUED"
    claim.extract_stage = "INGEST"
    claim.extract_progress = 0
    claim.extract_message = "任务已入队"
    claim.extract_manifest = None
    await clear_extraction_progress_cached(claim_id)
    await db.commit()

    job_id = await enqueue_extraction_pipeline(claim_id)
    claim.extract_job_id = job_id
    if job_id is None:
        claim.extract_status = "RUNNING"
    await db.commit()
    return job_id, claim.extract_status


async def cancel_extract_from_pdf(
    db: AsyncSession, *, claim_id: int, clinic_id: int
) -> ClaimSubmission:
    """取消进行中的 AI 识别，保留已上传 PDF，回到可重新点击「AI 识别」的状态。"""
    claim = await get_claim(db, claim_id, clinic_id)
    if claim.status != "DRAFT":
        raise ValidationException("仅草稿状态可取消识别")
    if not claim.extraction_task_id:
        raise ValidationException("请先上传病历 PDF")
    if claim.extract_status not in ("QUEUED", "RUNNING", "AWAITING_INPUT"):
        raise ValidationException("当前没有进行中的识别任务")

    job_id = claim.extract_job_id
    await abort_arq_job(job_id)

    task = await db.get(ExtractionTask, claim.extraction_task_id)
    if not task or task.clinic_id != clinic_id:
        raise ValidationException("关联的提取任务不存在")

    # 先切断 worker 的 claim 写入权（job_id 清空），再重置任务产物
    claim.extract_status = "IDLE"
    claim.extract_stage = None
    claim.extract_progress = 0
    claim.extract_message = None
    claim.extract_job_id = None
    claim.extract_manifest = None
    claim.ai_raw_result = None
    claim.final_field_values = None
    claim.ai_token_usage = None
    claim.ai_process_time_ms = None
    await clear_extraction_progress_cached(claim_id)
    await db.flush()

    await pdf_extraction_service.reset_task_to_uploaded(db, task)
    await db.commit()
    await db.refresh(claim)
    return claim


async def resume_extraction(
    db: AsyncSession, *, claim_id: int, clinic_id: int, visit_index: int
) -> tuple[str | None, str]:
    claim = await get_claim(db, claim_id, clinic_id)
    if claim.extract_status != "AWAITING_INPUT":
        raise ValidationException("当前无需选择就诊")

    claim.extract_status = "QUEUED"
    claim.extract_stage = "EXTRACT"
    claim.extract_progress = 60
    claim.extract_message = "续跑任务已入队"
    claim.extract_manifest = None
    await clear_extraction_progress_cached(claim_id)
    await db.commit()

    job_id = await enqueue_extraction_pipeline(
        claim_id, resume_from_stage="stage2", visit_index=visit_index
    )
    claim.extract_job_id = job_id
    if job_id is None:
        claim.extract_status = "RUNNING"
    await db.commit()
    return job_id, claim.extract_status


async def apply_extraction(
    db: AsyncSession, *, claim_id: int, clinic_id: int
) -> ClaimSubmission:
    """将 PDF 提取审核结果写入 claim 字段，进入 AI_FILLED。"""
    claim = await get_claim(db, claim_id, clinic_id)
    if claim.status not in ("DRAFT", "AI_FILLED"):
        raise ValidationException("仅草稿或 AI 已填状态可应用提取结果")
    if not claim.extraction_task_id:
        raise ValidationException("请先上传病历 PDF 并完成提取")

    task = await db.get(ExtractionTask, claim.extraction_task_id)
    if not task or task.clinic_id != clinic_id:
        raise ValidationException("关联的提取任务不存在")

    review_row = (
        await db.execute(
            select(ExtractionReviewOutput).where(
                ExtractionReviewOutput.task_id == task.id
            )
        )
    ).scalar_one_or_none()
    if not review_row:
        raise ValidationException("请先完成病历 PDF 提取与字段生成")

    # 补齐系统字段（诊所/医生等），避免 stub 提取后右侧与 claim 仍全空
    await pdf_extraction_service._complete_review_row_standard_fields(
        db, task=task, review_row=review_row
    )

    result_row = (
        await db.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one_or_none()

    display_fields = merge_review_fields_for_display(
        review_row.standard_fields or {},
        review_row.edited_fields,
    )

    claim.ai_raw_result = {
        code: {
            "value": field.get("value"),
            "confidence": float(field.get("confidence") or 0.0),
        }
        for code, field in display_fields.items()
    }
    from_review = {
        code: field.get("value") for code, field in display_fields.items()
    }
    # Late apply must not wipe values the doctor already saved (save-draft race).
    existing = _flatten_field_values(claim.final_field_values)
    claim.final_field_values = {**from_review, **existing}
    sync_claim_patient_names(claim)

    if result_row:
        claim.ai_token_usage = result_row.token_usage

    _ensure_transition(claim.status, "AI_FILLED")
    claim.status = "AI_FILLED"
    await db.commit()
    await db.refresh(claim)
    return claim


async def claim_to_out(db: AsyncSession, claim: ClaimSubmission) -> ClaimOut:
    # flush 后 updated_at 等列可能过期，需 refresh 避免异步懒加载触发 MissingGreenlet
    await db.refresh(claim)
    task_no = await get_extraction_task_no(db, claim)
    data = ClaimOut.model_validate(claim)
    return data.model_copy(update={"extraction_task_no": task_no})


async def save_draft(
    db: AsyncSession,
    *,
    claim_id: int,
    clinic_id: int,
    patient_name: str | None,
    medical_record_text: str | None,
) -> ClaimSubmission:
    claim = await get_claim(db, claim_id, clinic_id)
    if claim.status != "DRAFT":
        raise ValidationException("仅草稿状态可保存病历")
    if medical_record_text is not None:
        claim.medical_record_text = encrypt_text(medical_record_text)
    if patient_name is not None:
        claim.patient_name = patient_name or None
    await db.flush()
    return claim


async def extract_from_record(
    db: AsyncSession, *, claim_id: int, clinic_id: int
) -> ClaimSubmission:
    claim = await get_claim(db, claim_id, clinic_id)
    if claim.status != "DRAFT":
        raise ValidationException("仅草稿状态可触发 AI 识别")
    text = decrypt_text(claim.medical_record_text)
    if not text or not text.strip():
        raise ValidationException("请先输入病历内容")
    return await submit_medical_record(
        db,
        claim_id=claim_id,
        clinic_id=clinic_id,
        text=text,
        patient_name=claim.patient_name,
    )


async def get_home_overview(
    db: AsyncSession, *, doctor_id: int, clinic_id: int
) -> HomeOverview:
    doctor = await db.get(Doctor, doctor_id)
    clinic = await db.get(Clinic, clinic_id)
    if not doctor or not clinic:
        raise NotFoundException("医生或诊所不存在")

    now_hk = datetime.now(_HK)
    today_start = now_hk.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)
    month_start = now_hk.replace(day=1, hour=0, minute=0, second=0, microsecond=0).astimezone(UTC)

    base = and_(
        ClaimSubmission.doctor_id == doctor_id,
        ClaimSubmission.clinic_id == clinic_id,
        ClaimSubmission.status != "CANCELLED",
    )

    today_count = (
        await db.execute(
            select(func.count())
            .select_from(ClaimSubmission)
            .where(base, ClaimSubmission.created_at >= today_start)
        )
    ).scalar_one()

    pending_draft_count = (
        await db.execute(
            select(func.count())
            .select_from(ClaimSubmission)
            .where(base, ClaimSubmission.status.in_(("DRAFT", "AI_FILLED")))
        )
    ).scalar_one()

    month_total_count = (
        await db.execute(
            select(func.count())
            .select_from(ClaimSubmission)
            .where(base, ClaimSubmission.created_at >= month_start)
        )
    ).scalar_one()

    draft_rows = (
        await db.execute(
            select(ClaimSubmission, InsuranceCompany, PolicyTemplate)
            .join(InsuranceCompany, InsuranceCompany.id == ClaimSubmission.company_id)
            .join(PolicyTemplate, PolicyTemplate.id == ClaimSubmission.template_id)
            .where(
                base,
                ClaimSubmission.status.in_(("DRAFT", "AI_FILLED")),
            )
            .order_by(ClaimSubmission.updated_at.desc())
            .limit(5)
        )
    ).all()

    unfinished = [
        {
            "submission_id": c.id,
            "patient_name": c.patient_name,
            "company_name": co.company_name,
            "template_name": tpl.template_name,
            "status": c.status,
            "status_label": translate_message(_STATUS_LABELS.get(c.status, c.status)),
            "updated_at": c.updated_at,
        }
        for c, co, tpl in draft_rows
    ]

    recent_submissions = (
        await db.execute(
            select(ClaimSubmission)
            .where(base)
            .order_by(ClaimSubmission.updated_at.desc())
            .limit(50)
        )
    ).scalars().all()

    seen_shortcuts: set[tuple[int, int]] = set()
    shortcuts: list[dict] = []
    company_ids: set[int] = set()
    template_ids: set[int] = set()
    for sub in recent_submissions:
        key = (sub.company_id, sub.template_id)
        if key in seen_shortcuts:
            continue
        seen_shortcuts.add(key)
        company_ids.add(sub.company_id)
        template_ids.add(sub.template_id)
        shortcuts.append({"company_id": sub.company_id, "template_id": sub.template_id})
        if len(shortcuts) >= 4:
            break

    companies_map: dict[int, InsuranceCompany] = {}
    templates_map: dict[int, PolicyTemplate] = {}
    if company_ids:
        cos = (
            await db.execute(
                select(InsuranceCompany).where(InsuranceCompany.id.in_(company_ids))
            )
        ).scalars().all()
        companies_map = {c.id: c for c in cos}
    if template_ids:
        tpls = (
            await db.execute(
                select(PolicyTemplate).where(PolicyTemplate.id.in_(template_ids))
            )
        ).scalars().all()
        templates_map = {t.id: t for t in tpls}

    quick_start = [
        {
            "company_id": s["company_id"],
            "company_name": companies_map[s["company_id"]].company_name,
            "template_id": s["template_id"],
            "template_name": templates_map[s["template_id"]].template_name,
        }
        for s in shortcuts
        if s["company_id"] in companies_map and s["template_id"] in templates_map
    ]

    recent_rows = (
        await db.execute(
            select(ClaimSubmission, InsuranceCompany)
            .join(InsuranceCompany, InsuranceCompany.id == ClaimSubmission.company_id)
            .where(base)
            .order_by(ClaimSubmission.created_at.desc())
            .limit(10)
        )
    ).all()

    recent = [
        {
            "submission_id": c.id,
            "patient_name": c.patient_name,
            "company_name": co.company_name,
            "status": c.status,
            "status_label": translate_message(_STATUS_LABELS.get(c.status, c.status)),
            "created_at": c.created_at,
        }
        for c, co in recent_rows
    ]

    return HomeOverview(
        greeting_name=doctor.doctor_name,
        clinic_name=clinic.clinic_name,
        stats=HomeStats(
            today_count=today_count,
            pending_draft_count=pending_draft_count,
            month_total_count=month_total_count,
        ),
        unfinished_drafts=unfinished,
        quick_start_shortcuts=quick_start,
        recent_claims=recent,
    )


async def submit_medical_record(
    db: AsyncSession,
    *,
    claim_id: int,
    clinic_id: int,
    text: str,
    patient_name: str | None,
) -> ClaimSubmission:
    claim = await get_claim(db, claim_id, clinic_id)
    result = await ai_service.extract(
        db,
        text=text,
        template_id=claim.template_id,
        clinic_id=clinic_id,
        doctor_id=claim.doctor_id,
    )
    claim.medical_record_text = encrypt_text(text)
    if patient_name:
        claim.patient_name = patient_name
    claim.ai_raw_result = {
        code: {"value": f.value, "confidence": f.confidence}
        for code, f in result.extracted_fields.items()
    }
    claim.final_field_values = {
        code: f.value for code, f in result.extracted_fields.items()
    }
    claim.ai_token_usage = result.token_usage
    claim.ai_process_time_ms = result.process_time_ms
    _ensure_transition(claim.status, "AI_FILLED")
    claim.status = "AI_FILLED"
    await db.flush()
    return claim


async def update_fields(
    db: AsyncSession,
    *,
    claim_id: int,
    clinic_id: int,
    values: dict,
    confirmed: dict[str, bool] | None = None,
    row_version: int | None = None,
) -> ClaimSubmission:
    claim = await get_claim(db, claim_id, clinic_id)
    if row_version is not None and row_version != claim.row_version:
        raise ConflictException("Claim has been updated; refresh and try again")
    ai_result: dict = claim.ai_raw_result or {}

    # diff 对比写入变更日志
    field_code_to_id = await _standard_field_id_map(db, list(values.keys()))
    for code, final_value in values.items():
        ai_original = (ai_result.get(code) or {}).get("value")
        is_modified = str(ai_original) != str(final_value)
        sf_id = field_code_to_id.get(code)
        if sf_id is None:
            continue
        db.add(
            ClaimFieldChangeLog(
                submission_id=claim.id,
                standard_field_id=sf_id,
                ai_original_value=None if ai_original is None else str(ai_original),
                final_value=None if final_value is None else str(final_value),
                is_modified=is_modified,
            )
        )

    claim.final_field_values = {**(claim.final_field_values or {}), **values}
    if confirmed is not None:
        claim.field_confirmations = {
            **(claim.field_confirmations or {}),
            **confirmed,
        }
    sync_claim_patient_names(claim, values=claim.final_field_values)
    # Increment on every accepted write, including legacy clients which do not
    # yet send the cursor, so the next cursor-aware save remains protected.
    claim.row_version += 1
    await db.flush()
    return claim


async def confirm(db: AsyncSession, *, claim_id: int, clinic_id: int) -> ClaimSubmission:
    claim = await get_claim(db, claim_id, clinic_id)
    claim.final_field_values = _flatten_field_values(claim.final_field_values)
    # 必填缺失由前端提示；医生确认后仍可填入模板 PDF 并进入预览
    await generate_filled_pdf(db, claim_id, clinic_id)
    _ensure_transition(claim.status, "CONFIRMED")
    claim.status = "CONFIRMED"
    await db.flush()
    return claim


async def revert_to_review(
    db: AsyncSession, *, claim_id: int, clinic_id: int
) -> ClaimSubmission:
    """预览页「返回修改」：退回字段核对，status→AI_FILLED。"""
    claim = await get_claim(db, claim_id, clinic_id)
    _ensure_transition(claim.status, "AI_FILLED")
    claim.status = "AI_FILLED"
    await db.flush()
    return claim


async def mark_printed(
    db: AsyncSession, *, claim_id: int, clinic_id: int
) -> ClaimSubmission:
    claim = await get_claim(db, claim_id, clinic_id)
    _ensure_transition(claim.status, "PRINTED")
    claim.status = "PRINTED"
    await db.flush()
    return claim


async def cancel(db: AsyncSession, *, claim_id: int, clinic_id: int) -> ClaimSubmission:
    claim = await get_claim(db, claim_id, clinic_id)
    _ensure_transition(claim.status, "CANCELLED")
    claim.status = "CANCELLED"
    await db.flush()
    return claim


async def delete_claim(db: AsyncSession, *, claim_id: int, clinic_id: int) -> None:
    """硬删除填报记录（含已完成 PRINTED）：DB 记录 + MinIO/本地对象存储文件。"""
    claim = await get_claim(db, claim_id, clinic_id)
    # 允许进行中与已完成硬删；作废记录同样可清掉。
    if claim.status not in ("DRAFT", "AI_FILLED", "CONFIRMED", "PRINTED", "CANCELLED"):
        raise ValidationException("当前状态的填报不可删除")

    storage_keys: list[str] = []
    if claim.generated_pdf_url:
        storage_keys.append(claim.generated_pdf_url)

    task: ExtractionTask | None = None
    if claim.extraction_task_id is not None:
        task = await db.get(ExtractionTask, claim.extraction_task_id)
        if task:
            if task.pdf_url:
                storage_keys.append(task.pdf_url)
            page_paths = (
                await db.execute(
                    select(DocumentPage.image_path).where(
                        DocumentPage.task_id == task.id,
                        DocumentPage.image_path.is_not(None),
                    )
                )
            ).scalars().all()
            storage_keys.extend(path for path in page_paths if path)

    await clear_extraction_progress_cached(claim.id)

    # FK: claim.extraction_task_id ON DELETE SET NULL — delete task first.
    if task is not None:
        await db.delete(task)
        await db.flush()

    await db.delete(claim)
    await db.flush()

    # Best-effort object cleanup after DB commit path (flush is enough here;
    # router commits via session dependency). Missing objects are ignored.
    for key in dict.fromkeys(storage_keys):
        try:
            storage.delete_bytes(key)
            logger.info("claim_storage_deleted", claim_id=claim_id, key=key)
        except Exception as exc:
            logger.warning(
                "claim_storage_delete_failed",
                claim_id=claim_id,
                key=key,
                error=str(exc),
            )


async def list_claims(
    db: AsyncSession,
    *,
    clinic_id: int,
    doctor_id: int,
    patient_name: str | None,
    status: str | None,
    status_ne: str | None,
    date_from: datetime | None,
    date_to: datetime | None,
    page: int,
    page_size: int,
) -> tuple[list[ClaimListItem], int]:
    conds = [ClaimSubmission.clinic_id == clinic_id, ClaimSubmission.doctor_id == doctor_id]
    if patient_name:
        needle = f"%{patient_name}%"
        conds.append(
            or_(
                ClaimSubmission.patient_name.ilike(needle),
                ClaimSubmission.patient_name_cn.ilike(needle),
                ClaimSubmission.patient_name_en.ilike(needle),
            )
        )
    if status:
        # 支持单个或多个状态：status=PRINTED 或 status=DRAFT,AI_FILLED,CONFIRMED
        statuses = [s.strip() for s in status.split(",") if s.strip()]
        if len(statuses) == 1:
            conds.append(ClaimSubmission.status == statuses[0])
        elif statuses:
            conds.append(ClaimSubmission.status.in_(statuses))
    if status_ne:
        # 进行中：排除已打印等，status_ne=PRINTED
        excluded = [s.strip() for s in status_ne.split(",") if s.strip()]
        if len(excluded) == 1:
            conds.append(ClaimSubmission.status != excluded[0])
        elif excluded:
            conds.append(ClaimSubmission.status.not_in(excluded))
    if date_from:
        conds.append(ClaimSubmission.created_at >= date_from)
    if date_to:
        conds.append(ClaimSubmission.created_at <= date_to)

    where = and_(*conds)
    total = (
        await db.execute(select(func.count()).select_from(ClaimSubmission).where(where))
    ).scalar_one()
    stmt = (
        select(
            ClaimSubmission,
            InsuranceCompany.company_name,
            InsuranceCompany.company_name_en,
            PolicyTemplate.template_name,
            Clinic.clinic_name,
            Clinic.clinic_name_en,
        )
        .outerjoin(InsuranceCompany, InsuranceCompany.id == ClaimSubmission.company_id)
        .outerjoin(PolicyTemplate, PolicyTemplate.id == ClaimSubmission.template_id)
        .outerjoin(Clinic, Clinic.id == ClaimSubmission.clinic_id)
        .where(where)
        .order_by(ClaimSubmission.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(stmt)).all()
    items: list[ClaimListItem] = []
    for claim, company_name, company_name_en, template_name, clinic_name, clinic_name_en in rows:
        display_clinic = " ".join(
            part for part in (clinic_name, clinic_name_en or "") if part
        ).strip() or None
        items.append(
            ClaimListItem(
                id=claim.id,
                submission_no=claim.submission_no,
                patient_name=format_patient_display(
                    claim.patient_name_cn,
                    claim.patient_name_en,
                    claim.patient_name,
                ),
                patient_name_cn=claim.patient_name_cn,
                patient_name_en=claim.patient_name_en,
                company_id=claim.company_id,
                template_id=claim.template_id,
                generated_pdf_url=claim.generated_pdf_url,
                status=claim.status,
                created_at=claim.created_at,
                company_name=company_name,
                company_name_en=company_name_en,
                template_name=template_name,
                clinic_id=claim.clinic_id,
                clinic_name=display_clinic,
            )
        )
    return items, total


async def get_medical_record_plain(
    db: AsyncSession, claim_id: int, clinic_id: int
) -> str | None:
    claim = await get_claim(db, claim_id, clinic_id)
    return decrypt_text(claim.medical_record_text)


async def reuse_for_template(
    db: AsyncSession, *, claim_id: int, clinic_id: int, new_template_id: int
) -> tuple[ClaimSubmission, dict, list[str]]:
    source = await get_claim(db, claim_id, clinic_id)
    new_template = await db.get(PolicyTemplate, new_template_id)
    if not new_template or not new_template.is_active:
        raise ValidationException("目标模板不可用")

    required = await ai_service.get_required_fields_by_template(db, new_template_id)
    source_values: dict = source.final_field_values or {}
    prefilled: dict[str, str | None] = {}
    missing: list[str] = []
    for f in required:
        if f.field_code in source_values and source_values[f.field_code] is not None:
            prefilled[f.field_code] = source_values[f.field_code]
        else:
            missing.append(f.field_code)

    new_claim = ClaimSubmission(
        submission_no=_gen_submission_no(),
        clinic_id=clinic_id,
        doctor_id=source.doctor_id,
        company_id=new_template.company_id,
        template_id=new_template_id,
        template_version=new_template.version,
        patient_name=source.patient_name,
        patient_name_cn=source.patient_name_cn,
        patient_name_en=source.patient_name_en,
        final_field_values=prefilled,
        status="DRAFT",
    )
    db.add(new_claim)
    await db.flush()
    sync_claim_patient_names(new_claim)
    await db.flush()
    return new_claim, prefilled, missing


# ---------- 内部工具 ----------
async def _standard_field_id_map(
    db: AsyncSession, field_codes: list[str]
) -> dict[str, int]:
    if not field_codes:
        return {}
    rows = await db.execute(
        select(StandardField.field_code, StandardField.id).where(
            StandardField.field_code.in_(field_codes)
        )
    )
    return {code: fid for code, fid in rows.all()}


async def _validate_required(db: AsyncSession, claim: ClaimSubmission) -> None:
    stmt = (
        select(StandardField)
        .join(
            TemplateFieldMapping,
            TemplateFieldMapping.standard_field_id == StandardField.id,
        )
        .join(TemplateField, TemplateField.id == TemplateFieldMapping.template_field_id)
        .where(
            TemplateField.template_id == claim.template_id,
            StandardField.is_required.is_(True),
        )
        .distinct()
    )
    required_fields = list((await db.execute(stmt)).scalars().all())
    values = _flatten_field_values(claim.final_field_values)
    missing = [
        f.field_code
        for f in required_fields
        if not (values.get(f.field_code) or "").strip()
    ]
    if missing:
        labels = [
            f"{f.field_code}({f.field_name})" if f.field_name else f.field_code
            for f in required_fields
            if f.field_code in missing
        ]
        raise ValidationException(f"以下必填字段缺失: {', '.join(labels)}")
