"""PDF 提取任务服务层。"""
import asyncio
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.ai_usage_context import reset_ai_call_context, set_ai_call_context
from src.core.exceptions import ForbiddenException, NotFoundException, ValidationException, AppException
from src.db.models import (
    ClaimSubmission,
    Clinic,
    ClinicPolicyTemplate,
    DocumentClassification,
    DocumentPage,
    ExtractionMappedResult,
    ExtractionPrompt,
    ExtractionResult,
    ExtractionReviewOutput,
    ExtractionTask,
    ExtractionVisit,
    InsuranceCompany,
    OcrResult,
    PolicyTemplate,
    Doctor,
    StandardField,
    TemplateField,
    TemplateFieldMapping,
)
from src.modules.pdf_extraction.artifact_gates import (
    document_pages_to_step2_output,
    load_classification_row,
    load_document_pages,
    load_ocr_rows,
    ocr_rows_have_text,
    ocr_rows_to_step3_output,
    reject_if_failed,
    require_classification,
    require_document_pages,
    require_visit_selected,
    sync_task_progress,
)
from src.modules.pdf_extraction.ai_service import DocumentClassificationResult, get_document_classifier
from src.modules.pdf_extraction.ai_service.field_extractor import get_field_extractor
from src.modules.pdf_extraction.ai_service.visit_detector import get_visit_detector
from src.modules.pdf_extraction.extractable_field import ExtractableField, ExtractableFieldSpec
from src.modules.pdf_extraction.ocr_service.engine_pool import get_ocr_pool
from src.modules.pdf_extraction.schemas import (
    DocumentClassificationOut,
    DocumentPageOut,
    OcrBlockOut,
    OcrResultOut,
    Step1UploadInput,
    Step1UploadOutput,
    Step2PreprocessInput,
    Step2PreprocessOutput,
    Step3OcrInput,
    Step3OcrOutput,
    Step3PageOcrOutput,
    Step3PageSourceInput,
    Step4ClassifyOutput,
    Step5DetectVisitsOutput,
    Step5SelectVisitInput,
    Step5SelectVisitOutput,
    Step6BuildPromptOutput,
    Step7ExtractFieldsOutput,
    Step8ValidateOutput,
    Step9DetectMissingOutput,
    Step10MapInput,
    Step10MapOutput,
    FinalizeExtractionInput,
    FinalizeExtractionOutput,
    Step11ConfirmReviewOutput,
    Step11PrepareReviewOutput,
    Step11SaveReviewInput,
    Step11SaveReviewOutput,
    ExtractionMappedResultOut,
    ExtractionPromptOut,
    ExtractionResultOut,
    ExtractionReviewOutputOut,
    VisitCandidateOut,
)
from src.modules.pdf_extraction.steps.step6_prompt_builder import (
    SelectedVisitContext,
    assemble_extraction_text,
    assemble_visit_scoped_extraction_text,
    build_extraction_prompt_text,
    filter_pages_for_visit,
    partition_pages_for_visit_extraction,
)
from src.utils.rate_limit import check_ai_rate_limit
from src.modules.pdf_extraction.steps.step1_upload import run_step1_upload
from src.modules.pdf_extraction.steps.step2_preprocess import (
    build_step2_output,
    preprocess_pdf_bytes,
    preprocess_pdf_mineru_placeholder,
)
from src.modules.pdf_extraction.document_parser import uses_mineru
from src.modules.pdf_extraction.document_parser.mineru_parser import parse_pdf_with_mineru
from src.modules.pdf_extraction.document_parser.markdown_adapter import markdown_to_step3_pages
from src.modules.pdf_extraction.steps.step3_ocr import run_step3_ocr_async
from src.modules.pdf_extraction.steps.step4_classify import assemble_document_text
from src.modules.pdf_extraction.steps.step5_detect_visits import assemble_visit_detection_text
from src.modules.pdf_extraction.steps.step8_validate import validate_extracted_fields
from src.modules.pdf_extraction.steps.step9_detect_missing import detect_missing_fields
from src.modules.pdf_extraction.steps.step10_insurance_mapper import (
    map_fields_to_insurance,
    normalize_insurance_key,
    resolve_fallback_mapping,
)
from src.modules.pdf_extraction.steps.step11_review_output import (
    apply_doctor_field_edits,
    build_standard_review_fields,
    complete_standard_review_fields,
)
from src.modules.pdf_extraction.step_timing import timed_extraction_step
from src.utils import storage


def _ocr_rows_to_pages(task_no: str, rows: list[OcrResult]) -> list[Step3PageOcrOutput]:
    return [
        Step3PageOcrOutput(
            task_id=task_no,
            page=row.page_no,
            blocks=[OcrBlockOut.model_validate(block) for block in row.blocks],
        )
        for row in rows
    ]


async def _load_ocr_pages(
    db: AsyncSession, task: ExtractionTask
) -> tuple[list[OcrResult], list[Step3PageOcrOutput]]:
    ocr_rows = list(
        (
            await db.execute(
                select(OcrResult)
                .where(OcrResult.task_id == task.id)
                .order_by(OcrResult.page_no)
            )
        ).scalars().all()
    )
    if not ocr_rows:
        raise ValidationException("未找到 ocr_result，请先执行 Step3 OCR")
    return ocr_rows, _ocr_rows_to_pages(task.task_no, ocr_rows)


async def _delete_extraction_outputs(db: AsyncSession, task_id: int) -> None:
    await db.execute(delete(ExtractionResult).where(ExtractionResult.task_id == task_id))
    await db.execute(
        delete(ExtractionMappedResult).where(ExtractionMappedResult.task_id == task_id)
    )
    await db.execute(
        delete(ExtractionReviewOutput).where(ExtractionReviewOutput.task_id == task_id)
    )


async def reset_task_to_uploaded(db: AsyncSession, task: ExtractionTask) -> None:
    """保留 PDF，清除识别产物，回到刚上传后的 WAITING 状态。"""
    await db.execute(delete(DocumentPage).where(DocumentPage.task_id == task.id))
    await db.execute(delete(OcrResult).where(OcrResult.task_id == task.id))
    await _delete_downstream_results(db, task.id)
    task.status = "WAITING"
    task.current_step = "STEP1_UPLOAD"
    task.error_message = None
    await db.flush()


async def _delete_post_classification_results(db: AsyncSession, task_id: int) -> None:
    await db.execute(delete(ExtractionVisit).where(ExtractionVisit.task_id == task_id))
    await db.execute(delete(ExtractionPrompt).where(ExtractionPrompt.task_id == task_id))
    await _delete_extraction_outputs(db, task_id)


async def _delete_downstream_results(db: AsyncSession, task_id: int) -> None:
    await db.execute(delete(DocumentClassification).where(DocumentClassification.task_id == task_id))
    await _delete_post_classification_results(db, task_id)


async def _load_classification_row(
    db: AsyncSession, task: ExtractionTask
) -> DocumentClassification:
    row = (
        await db.execute(
            select(DocumentClassification).where(DocumentClassification.task_id == task.id)
        )
    ).scalar_one_or_none()
    if not row:
        raise ValidationException("未找到 document_classification，请先执行 Step4")
    return row


async def _load_ai_standard_fields(db: AsyncSession) -> list[StandardField]:
    return list(
        (
            await db.execute(
                select(StandardField)
                .where(StandardField.source_type == "AI", StandardField.is_active.is_(True))
                .order_by(StandardField.id)
            )
        ).scalars().all()
    )


async def _load_active_standard_fields(db: AsyncSession) -> list[StandardField]:
    return list(
        (
            await db.execute(
                select(StandardField)
                .where(StandardField.is_active.is_(True))
                .order_by(StandardField.id)
            )
        ).scalars().all()
    )


async def _resolve_task_template_id(
    db: AsyncSession, task: ExtractionTask
) -> int | None:
    """从关联 claim 或 Step10 mapped_result 解析模板 ID。"""
    claim = (
        await db.execute(
            select(ClaimSubmission).where(
                ClaimSubmission.extraction_task_id == task.id
            )
        )
    ).scalar_one_or_none()
    if claim and claim.template_id:
        return claim.template_id

    mapped = (
        await db.execute(
            select(ExtractionMappedResult).where(
                ExtractionMappedResult.task_id == task.id
            )
        )
    ).scalar_one_or_none()
    if mapped and mapped.template_id:
        return mapped.template_id
    return None


async def _load_template_specific_ai_fields(
    db: AsyncSession, *, template_id: int | None
) -> list[ExtractableFieldSpec]:
    """加载模板映射中的「模板专属 AI 提取」字段。"""
    if not template_id:
        return []

    rows = (
        await db.execute(
            select(
                TemplateFieldMapping.template_specific_field_code,
                TemplateFieldMapping.template_specific_ai_hint,
                TemplateField.field_label_raw,
                TemplateField.pdf_field_name,
            )
            .join(
                TemplateField,
                TemplateField.id == TemplateFieldMapping.template_field_id,
            )
            .where(
                TemplateField.template_id == template_id,
                TemplateField.field_status == "MAPPED",
                TemplateFieldMapping.template_specific_field_code.is_not(None),
                TemplateFieldMapping.template_specific_ai_hint.is_not(None),
            )
            .order_by(TemplateField.id)
        )
    ).all()

    seen: set[str] = set()
    specs: list[ExtractableFieldSpec] = []
    for code, hint, label_raw, pdf_name in rows:
        field_code = (code or "").strip()
        ai_hint = (hint or "").strip()
        if not field_code or not ai_hint or field_code in seen:
            continue
        seen.add(field_code)
        field_name = (label_raw or field_code or pdf_name).strip() or field_code
        specs.append(
            ExtractableFieldSpec(
                field_code=field_code,
                field_name=field_name,
                data_type="text",
                ai_extraction_hint=ai_hint,
            )
        )
    return specs


async def _load_extractable_fields_for_task(
    db: AsyncSession, task: ExtractionTask
) -> tuple[list[StandardField], list[ExtractableFieldSpec]]:
    """返回 (标准 AI 字段, 模板专属字段)；专属字段排除与标准 code 冲突项。"""
    ai_fields = await _load_ai_standard_fields(db)
    active_fields = await _load_active_standard_fields(db)
    standard_codes = {field.field_code for field in active_fields}
    template_id = await _resolve_task_template_id(db, task)
    template_specs = [
        spec
        for spec in await _load_template_specific_ai_fields(db, template_id=template_id)
        if spec.field_code not in standard_codes
    ]
    return ai_fields, template_specs


async def _build_system_review_values(
    db: AsyncSession, task: ExtractionTask
) -> dict[str, str | None]:
    """系统已知字段：即使 AI stub/失败，也应写入核对表，避免右侧空白。"""
    values: dict[str, str | None] = {}
    if task.patient_name and str(task.patient_name).strip():
        values["patient_name_cn"] = str(task.patient_name).strip()

    doctor = (
        await db.execute(select(Doctor).where(Doctor.id == task.doctor_id))
    ).scalar_one_or_none()
    if doctor:
        if doctor.doctor_name and str(doctor.doctor_name).strip():
            values["doctor_name"] = str(doctor.doctor_name).strip()
        if doctor.signature_url:
            values["doctor_signature"] = doctor.signature_url

    clinic = (
        await db.execute(select(Clinic).where(Clinic.id == task.clinic_id))
    ).scalar_one_or_none()
    if clinic and clinic.clinic_name and str(clinic.clinic_name).strip():
        values["clinic_name"] = str(clinic.clinic_name).strip()

    return values


async def _template_specific_meta_for_task(
    db: AsyncSession, task: ExtractionTask
) -> tuple[list[str], dict[str, str]]:
    _, template_specs = await _load_extractable_fields_for_task(db, task)
    codes = [spec.field_code for spec in template_specs]
    labels = {spec.field_code: spec.field_name for spec in template_specs}
    return codes, labels


async def _complete_review_row_standard_fields(
    db: AsyncSession,
    *,
    task: ExtractionTask,
    review_row: ExtractionReviewOutput,
) -> bool:
    standard_fields = await _load_active_standard_fields(db)
    template_codes, _ = await _template_specific_meta_for_task(db, task)
    completed = complete_standard_review_fields(
        review_row.standard_fields or {},
        standard_field_codes=[
            field.field_code for field in standard_fields
        ]
        + template_codes,
        system_values=await _build_system_review_values(db, task),
    )
    if completed == (review_row.standard_fields or {}):
        return False
    review_row.standard_fields = completed
    return True


async def _review_output_out(
    db: AsyncSession, *, task: ExtractionTask, review_row: ExtractionReviewOutput
) -> ExtractionReviewOutputOut:
    codes, labels = await _template_specific_meta_for_task(db, task)
    return ExtractionReviewOutputOut.from_row(
        task.task_no,
        review_row,
        template_specific_field_codes=codes,
        field_labels=labels or None,
    )


async def create_upload_task(
    db: AsyncSession,
    *,
    clinic_id: int,
    doctor_id: int,
    filename: str,
    file_bytes: bytes,
    patient_name: str | None = None,
) -> Step1UploadOutput:
    data = Step1UploadInput(
        clinic_id=clinic_id,
        doctor_id=doctor_id,
        original_filename=filename,
        patient_name=patient_name,
    )
    result = await run_step1_upload(db, data, file_bytes)
    await db.commit()
    return result


async def get_task(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> ExtractionTask:
    task = (
        await db.execute(
            select(ExtractionTask).where(ExtractionTask.task_no == task_no)
        )
    ).scalar_one_or_none()
    if not task:
        raise NotFoundException("提取任务不存在")
    if task.clinic_id != clinic_id:
        raise ForbiddenException("无权访问该任务")
    return task


async def get_task_pdf_bytes(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> tuple[bytes, str]:
    """读取任务原件 PDF（MinIO），供前端 iframe 预览。"""
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    pdf_bytes = storage.download_bytes(task.pdf_url)
    filename = task.original_filename or "original.pdf"
    return pdf_bytes, filename


@timed_extraction_step("step2_preprocess")
async def run_preprocess(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> Step2PreprocessOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    existing_pages = await load_document_pages(db, task.id)
    if existing_pages:
        output = document_pages_to_step2_output(task, existing_pages)
        await sync_task_progress(
            db,
            task,
            status="OCR",
            current_step="STEP2_PREPROCESS_DONE",
        )
        return output

    task.status = "PREPROCESSING"
    task.current_step = "STEP2_PREPROCESS"
    task.error_message = None
    await db.flush()

    try:
        pdf_bytes = storage.download_bytes(task.pdf_url)
        step_input = Step2PreprocessInput(
            task_id=task.task_no,
            clinic_id=task.clinic_id,
            pdf_url=task.pdf_url,
        )
        page_outputs = (
            preprocess_pdf_mineru_placeholder(pdf_bytes, step_input)
            if uses_mineru()
            else preprocess_pdf_bytes(pdf_bytes, step_input)
        )

        await db.execute(delete(DocumentPage).where(DocumentPage.task_id == task.id))
        await db.execute(delete(OcrResult).where(OcrResult.task_id == task.id))
        await _delete_downstream_results(db, task.id)
        for page in page_outputs:
            db.add(
                DocumentPage(
                    task_id=task.id,
                    page_no=page.page,
                    source=page.source,
                    text=page.text,
                    image_path=page.image_path,
                )
            )

        task.status = "OCR"
        task.current_step = "STEP2_PREPROCESS_DONE"
        output = build_step2_output(step_input, page_outputs)
        await db.commit()
        return output
    except Exception as exc:
        task.status = "FAILED"
        task.current_step = "STEP2_PREPROCESS"
        task.error_message = str(exc)
        await db.commit()
        raise


@timed_extraction_step("step3_ocr")
async def run_ocr(db: AsyncSession, *, task_no: str, clinic_id: int) -> Step3OcrOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    existing_ocr = await load_ocr_rows(db, task.id)
    if existing_ocr and ocr_rows_have_text(existing_ocr):
        output = ocr_rows_to_step3_output(task.task_no, existing_ocr)
        await sync_task_progress(
            db,
            task,
            status="CLASSIFYING",
            current_step="STEP3_OCR_DONE",
        )
        return output

    document_pages = await require_document_pages(db, task)

    task.status = "OCR"
    task.current_step = "STEP3_OCR"
    task.error_message = None
    await db.flush()

    try:
        if uses_mineru():
            pdf_bytes = storage.download_bytes(task.pdf_url)
            parsed = await parse_pdf_with_mineru(pdf_bytes, task_id=task.task_no)
            md_key = (
                f"medical-records/{task.clinic_id}/{task.task_no}/parsed/content.md"
            )
            storage.upload_bytes(
                parsed.markdown.encode("utf-8"),
                md_key,
                content_type="text/markdown; charset=utf-8",
            )
            page_outputs = markdown_to_step3_pages(
                task_id=task.task_no,
                pages=parsed.pages,
            )
            if not any(p.blocks for p in page_outputs):
                raise ValidationException("MinerU 未解析出可用文本，请检查 PDF 或 MinerU 配置")

            await db.execute(delete(OcrResult).where(OcrResult.task_id == task.id))
            await _delete_downstream_results(db, task.id)
            for page in page_outputs:
                db.add(
                    OcrResult(
                        task_id=task.id,
                        page_no=page.page,
                        blocks=[block.model_dump() for block in page.blocks],
                    )
                )

            ocr_page_count = sum(1 for p in page_outputs if p.blocks)
            text_layer_page_count = len(page_outputs) - ocr_page_count
            total_blocks = sum(len(p.blocks) for p in page_outputs)
            output = Step3OcrOutput(
                task_id=task.task_no,
                status="CLASSIFYING",
                page_count=len(page_outputs),
                ocr_page_count=ocr_page_count,
                text_layer_page_count=text_layer_page_count,
                total_blocks=total_blocks,
                pages=page_outputs,
            )
        else:
            step_input = Step3OcrInput(
                task_id=task.task_no,
                pages=[
                    Step3PageSourceInput(
                        page=p.page_no,
                        source=p.source,  # type: ignore[arg-type]
                        text=p.text,
                        image_path=p.image_path,
                    )
                    for p in document_pages
                ],
            )
            pool = get_ocr_pool()
            output = await run_step3_ocr_async(
                step_input,
                pool=pool,
                download_image=storage.download_bytes,
            )

            if output.ocr_page_count > 0 and output.total_blocks == 0:
                raise ValidationException("OCR 未识别到文字，请检查 PDF 图像质量或重试")

            await db.execute(delete(OcrResult).where(OcrResult.task_id == task.id))
            await _delete_downstream_results(db, task.id)
            for page in output.pages:
                db.add(
                    OcrResult(
                        task_id=task.id,
                        page_no=page.page,
                        blocks=[block.model_dump() for block in page.blocks],
                    )
                )

        task.status = "CLASSIFYING"
        task.current_step = "STEP3_OCR_DONE"
        await db.commit()
        return output
    except ValidationException:
        task.status = "OCR"
        task.error_message = None
        await db.commit()
        raise
    except Exception as exc:
        task.status = "FAILED"
        task.current_step = "STEP3_OCR"
        task.error_message = str(exc)
        await db.commit()
        raise


async def list_document_pages(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> list[DocumentPageOut]:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    pages = (
        await db.execute(
            select(DocumentPage)
            .where(DocumentPage.task_id == task.id)
            .order_by(DocumentPage.page_no)
        )
    ).scalars().all()
    return [DocumentPageOut.model_validate(p) for p in pages]


async def list_ocr_results(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> list[OcrResultOut]:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    rows = (
        await db.execute(
            select(OcrResult)
            .where(OcrResult.task_id == task.id)
            .order_by(OcrResult.page_no)
        )
    ).scalars().all()
    return [OcrResultOut.model_validate(r) for r in rows]


@timed_extraction_step("step4_classify")
async def run_classify(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> Step4ClassifyOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    existing_classification = await load_classification_row(db, task.id)
    if existing_classification:
        next_status = (
            "VISIT_SELECT"
            if existing_classification.need_visit_selector
            else "EXTRACTING"
        )
        await sync_task_progress(
            db,
            task,
            status=next_status,
            current_step="STEP4_CLASSIFY_DONE",
        )
        return Step4ClassifyOutput(
            task_id=task.task_no,
            status=next_status,  # type: ignore[arg-type]
            classification=DocumentClassificationOut.model_validate(
                existing_classification
            ),
            source_text_preview="",
        )

    ocr_rows, pages = await _load_ocr_pages(db, task)

    task.current_step = "STEP4_CLASSIFY"
    task.error_message = None
    await db.flush()

    try:
        pages = _ocr_rows_to_pages(task.task_no, list(ocr_rows))
        document_text, pages_used, char_count = assemble_document_text(pages)
        if not document_text.strip():
            raise ValidationException("分类文本为空，请检查 OCR 结果")

        usage_token = set_ai_call_context(
            purpose="classify",
            clinic_id=task.clinic_id,
            doctor_id=task.doctor_id,
        )
        try:
            invoke = await get_document_classifier().classify(document_text)
        finally:
            reset_ai_call_context(usage_token)
        classification = invoke.classification

        existing = (
            await db.execute(
                select(DocumentClassification).where(
                    DocumentClassification.task_id == task.id
                )
            )
        ).scalar_one_or_none()
        if existing:
            await db.delete(existing)
            await db.flush()

        await db.execute(delete(ExtractionVisit).where(ExtractionVisit.task_id == task.id))
        await _delete_post_classification_results(db, task.id)

        row = DocumentClassification(
            task_id=task.id,
            document_type=classification.document_type,
            language=classification.language,
            multiple_patient=classification.multiple_patient,
            multiple_visit=classification.multiple_visit,
            insurance_company=classification.insurance_company,
            need_visit_selector=classification.need_visit_selector,
            source_text_chars=char_count,
            source_pages_used=pages_used,
            model_name=invoke.model_name,
            token_usage=invoke.token_usage,
            stub=invoke.stub,
        )
        db.add(row)

        next_status = "VISIT_SELECT" if classification.need_visit_selector else "EXTRACTING"
        task.status = next_status
        task.current_step = "STEP4_CLASSIFY_DONE"
        await db.commit()
        await db.refresh(row)

        preview = document_text[:500] + ("…" if len(document_text) > 500 else "")
        return Step4ClassifyOutput(
            task_id=task.task_no,
            status=next_status,  # type: ignore[arg-type]
            classification=DocumentClassificationOut.model_validate(row),
            source_text_preview=preview,
        )
    except AppException:
        raise
    except Exception as exc:
        task.status = "FAILED"
        task.current_step = "STEP4_CLASSIFY"
        task.error_message = str(exc)
        await db.commit()
        raise


async def get_classification(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> DocumentClassificationOut:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    row = (
        await db.execute(
            select(DocumentClassification).where(DocumentClassification.task_id == task.id)
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundException("尚未执行 Step4 文档分类")
    return DocumentClassificationOut.model_validate(row)


@timed_extraction_step("step5_detect_visits")
async def run_detect_visits(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> Step5DetectVisitsOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    existing_rows = list(
        (
            await db.execute(
                select(ExtractionVisit)
                .where(ExtractionVisit.task_id == task.id)
                .order_by(ExtractionVisit.visit_index)
            )
        ).scalars().all()
    )
    if existing_rows:
        return Step5DetectVisitsOutput(
            task_id=task.task_no,
            visits=[VisitCandidateOut.from_row(row) for row in existing_rows],
            source_text_preview="",
        )

    classification_row = await require_classification(db, task)
    if not classification_row.need_visit_selector:
        raise ValidationException("该文档无需多就诊选择")

    _, pages = await _load_ocr_pages(db, task)
    total_pages = len(pages)

    task.current_step = "STEP5_DETECT_VISITS"
    task.error_message = None
    await db.flush()

    try:
        document_text, _, _ = assemble_visit_detection_text(pages)
        if not document_text.strip():
            raise ValidationException("就诊检测文本为空，请检查 OCR 结果")

        classification = DocumentClassificationResult.model_validate(
            classification_row, from_attributes=True
        )
        usage_token = set_ai_call_context(
            purpose="detect_visits",
            clinic_id=task.clinic_id,
            doctor_id=task.doctor_id,
        )
        try:
            invoke = await get_visit_detector().detect_visits(
                document_text,
                classification,
                total_pages=total_pages,
            )
        finally:
            reset_ai_call_context(usage_token)

        await db.execute(delete(ExtractionVisit).where(ExtractionVisit.task_id == task.id))
        rows: list[ExtractionVisit] = []
        for visit in invoke.visits:
            row = ExtractionVisit(
                task_id=task.id,
                visit_index=visit.visit_index,
                visit_date=visit.visit_date,
                summary=visit.summary,
                page_start=visit.page_range[0],
                page_end=visit.page_range[1],
                selected=False,
                model_name=invoke.model_name,
                token_usage=invoke.token_usage,
                stub=invoke.stub,
            )
            db.add(row)
            rows.append(row)

        task.status = "VISIT_SELECT"
        task.current_step = "STEP5_DETECT_VISITS_DONE"
        await db.commit()
        for row in rows:
            await db.refresh(row)

        preview = document_text[:500] + ("…" if len(document_text) > 500 else "")
        return Step5DetectVisitsOutput(
            task_id=task.task_no,
            visits=[VisitCandidateOut.from_row(row) for row in rows],
            source_text_preview=preview,
        )
    except Exception as exc:
        task.status = "FAILED"
        task.current_step = "STEP5_DETECT_VISITS"
        task.error_message = str(exc)
        await db.commit()
        raise


async def list_visits(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> list[VisitCandidateOut]:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    rows = (
        await db.execute(
            select(ExtractionVisit)
            .where(ExtractionVisit.task_id == task.id)
            .order_by(ExtractionVisit.visit_index)
        )
    ).scalars().all()
    return [VisitCandidateOut.from_row(row) for row in rows]


@timed_extraction_step("step5_select_visit")
async def select_visit(
    db: AsyncSession,
    *,
    task_no: str,
    clinic_id: int,
    data: Step5SelectVisitInput,
) -> Step5SelectVisitOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    rows = list(
        (
            await db.execute(
                select(ExtractionVisit)
                .where(ExtractionVisit.task_id == task.id)
                .order_by(ExtractionVisit.visit_index)
            )
        ).scalars().all()
    )
    if not rows:
        raise ValidationException("尚未执行 Step5 就诊检测")

    selected = next((row for row in rows if row.visit_index == data.visit_index), None)
    if not selected:
        raise ValidationException(f"visit_index={data.visit_index} 不存在")

    current = next((row for row in rows if row.selected), None)
    if current and current.visit_index == data.visit_index:
        await sync_task_progress(
            db,
            task,
            status="EXTRACTING",
            current_step="STEP5_VISIT_SELECTED",
        )
        return Step5SelectVisitOutput(
            task_id=task.task_no,
            selected_visit=VisitCandidateOut.from_row(current),
        )

    if current:
        await _delete_extraction_outputs(db, task.id)
        await db.execute(
            delete(ExtractionPrompt).where(ExtractionPrompt.task_id == task.id)
        )
        await db.flush()

    for row in rows:
        row.selected = row.id == selected.id

    task.status = "EXTRACTING"
    task.current_step = "STEP5_VISIT_SELECTED"
    await db.commit()
    await db.refresh(selected)

    return Step5SelectVisitOutput(
        task_id=task.task_no,
        selected_visit=VisitCandidateOut.from_row(selected),
    )


@timed_extraction_step("step6_build_prompt")
async def run_build_prompt(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> Step6BuildPromptOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    classification_row = await require_classification(db, task)
    selected_visit = await require_visit_selected(db, task, classification_row)
    ai_fields, template_specs = await _load_extractable_fields_for_task(db, task)
    extractable_fields: list[ExtractableField] = [*ai_fields, *template_specs]
    if not extractable_fields:
        raise ValidationException("标准字段库中没有可 AI 提取的字段")
    expected_field_codes = [field.field_code for field in extractable_fields]

    _, pages = await _load_ocr_pages(db, task)
    if selected_visit:
        context_pages, visit_pages = partition_pages_for_visit_extraction(
            pages,
            page_start=selected_visit.page_start,
            page_end=selected_visit.page_end,
        )
        if not visit_pages:
            raise ValidationException("选定就诊范围内没有可用 OCR 页面")
        ocr_content, pages_used, char_count = assemble_visit_scoped_extraction_text(
            context_pages,
            visit_pages,
        )
    else:
        filtered_pages = filter_pages_for_visit(pages)
        if not filtered_pages:
            raise ValidationException("没有可用 OCR 页面")
        ocr_content, pages_used, char_count = assemble_extraction_text(filtered_pages)

    task.current_step = "STEP6_BUILD_PROMPT"
    task.error_message = None
    await db.flush()

    try:
        if not ocr_content.strip():
            raise ValidationException("提取文本为空，请检查 OCR 结果")

        visit_ctx = (
            SelectedVisitContext(
                visit_index=selected_visit.visit_index,
                visit_date=selected_visit.visit_date,
                summary=selected_visit.summary,
                page_start=selected_visit.page_start,
                page_end=selected_visit.page_end,
            )
            if selected_visit
            else None
        )
        prompt_text = build_extraction_prompt_text(
            document_type=classification_row.document_type,
            language=classification_row.language,
            insurance_company=classification_row.insurance_company,
            ocr_content=ocr_content,
            fields=ai_fields,
            template_specific_fields=template_specs,
            selected_visit=visit_ctx,
            uploaded_patient_name=task.patient_name,
        )

        existing = (
            await db.execute(
                select(ExtractionPrompt).where(ExtractionPrompt.task_id == task.id)
            )
        ).scalar_one_or_none()
        if existing:
            same_visit = (
                selected_visit is None
                and existing.selected_visit_index is None
            ) or (
                selected_visit is not None
                and existing.selected_visit_index == selected_visit.visit_index
            )
            same_fields = set(existing.field_codes or []) == set(expected_field_codes)
            if same_visit and same_fields:
                preview = existing.prompt_text[:800] + (
                    "…" if len(existing.prompt_text) > 800 else ""
                )
                task.status = "EXTRACTING"
                task.current_step = "STEP6_BUILD_PROMPT_DONE"
                await db.commit()
                return Step6BuildPromptOutput(
                    task_id=task.task_no,
                    prompt=ExtractionPromptOut.model_validate(existing),
                    prompt_preview=preview,
                )
            await db.delete(existing)
            await db.flush()

        await _delete_extraction_outputs(db, task.id)

        prompt_row = ExtractionPrompt(
            task_id=task.id,
            prompt_text=prompt_text,
            field_codes=expected_field_codes,
            selected_visit_index=selected_visit.visit_index if selected_visit else None,
            source_text_chars=char_count,
            source_pages_used=pages_used,
        )
        db.add(prompt_row)

        task.status = "EXTRACTING"
        task.current_step = "STEP6_BUILD_PROMPT_DONE"
        await db.commit()
        await db.refresh(prompt_row)

        preview = prompt_text[:800] + ("…" if len(prompt_text) > 800 else "")
        return Step6BuildPromptOutput(
            task_id=task.task_no,
            prompt=ExtractionPromptOut.model_validate(prompt_row),
            prompt_preview=preview,
        )
    except Exception as exc:
        task.status = "FAILED"
        task.current_step = "STEP6_BUILD_PROMPT"
        task.error_message = str(exc)
        await db.commit()
        raise


async def get_prompt(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> ExtractionPromptOut:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    row = (
        await db.execute(
            select(ExtractionPrompt).where(ExtractionPrompt.task_id == task.id)
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundException("尚未执行 Step6 Prompt Builder")
    return ExtractionPromptOut.model_validate(row)


@timed_extraction_step("step7_extract_fields")
async def run_extract_fields(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> Step7ExtractFieldsOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    prompt_row = (
        await db.execute(
            select(ExtractionPrompt).where(ExtractionPrompt.task_id == task.id)
        )
    ).scalar_one_or_none()
    if not prompt_row:
        raise ValidationException("请先执行 Step6 Prompt Builder")

    existing_result = (
        await db.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one_or_none()
    if existing_result:
        ui_status = {
            "raw": "VALIDATING",
            "validated": "VALIDATING",
            "final": "MAPPING",
        }.get(existing_result.stage, "VALIDATING")
        await sync_task_progress(
            db,
            task,
            status=ui_status,
            current_step="STEP7_EXTRACT_FIELDS_DONE",
        )
        return Step7ExtractFieldsOutput(
            task_id=task.task_no,
            result=ExtractionResultOut.from_row(existing_result),
        )

    ai_fields, template_specs = await _load_extractable_fields_for_task(db, task)
    field_map = {field.field_code: field for field in [*ai_fields, *template_specs]}
    target_fields = [
        field_map[code]
        for code in prompt_row.field_codes
        if code in field_map
    ]
    if not target_fields:
        raise ValidationException("Prompt 中的字段在标准字段库中不存在")

    await check_ai_rate_limit(task.clinic_id)

    task.current_step = "STEP7_EXTRACT_FIELDS"
    task.error_message = None
    await db.flush()

    try:
        usage_token = set_ai_call_context(
            purpose="extract_fields",
            clinic_id=task.clinic_id,
            doctor_id=task.doctor_id,
        )
        try:
            invoke = await get_field_extractor().extract_fields(
                prompt_row.prompt_text, target_fields
            )
        finally:
            reset_ai_call_context(usage_token)

        existing = (
            await db.execute(
                select(ExtractionResult).where(ExtractionResult.task_id == task.id)
            )
        ).scalar_one_or_none()
        if existing:
            await db.delete(existing)
            await db.flush()
        await _delete_extraction_outputs(db, task.id)

        result_row = ExtractionResult(
            task_id=task.id,
            fields={
                code: value.model_dump()
                for code, value in invoke.fields.items()
            },
            model_name=invoke.model_name,
            token_usage=invoke.token_usage,
            stub=invoke.stub,
            stage="raw",
        )
        db.add(result_row)

        task.status = "VALIDATING"
        task.current_step = "STEP7_EXTRACT_FIELDS_DONE"
        await db.commit()
        await db.refresh(result_row)

        return Step7ExtractFieldsOutput(
            task_id=task.task_no,
            result=ExtractionResultOut.from_row(result_row),
        )
    except Exception as exc:
        task.status = "FAILED"
        task.current_step = "STEP7_EXTRACT_FIELDS"
        task.error_message = str(exc)
        await db.commit()
        raise


async def get_extraction_result(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> ExtractionResultOut:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    row = (
        await db.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundException("尚未执行 Step7 字段提取")
    return ExtractionResultOut.from_row(row)


def _build_enum_options(fields: list[StandardField]) -> dict[str, frozenset[str]]:
    options: dict[str, frozenset[str]] = {}
    for field in fields:
        if field.enum_options:
            options[field.field_code] = frozenset(field.enum_options)
    return options


@timed_extraction_step("step8_validate")
async def run_validate(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> Step8ValidateOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    result_row = (
        await db.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one_or_none()
    if not result_row:
        raise ValidationException("请先执行 Step7 字段提取")
    if result_row.stage in {"validated", "final"}:
        await sync_task_progress(
            db,
            task,
            status="VALIDATING",
            current_step="STEP8_VALIDATE_DONE",
        )
        return Step8ValidateOutput(
            task_id=task.task_no,
            result=ExtractionResultOut.from_row(result_row),
        )

    if result_row.stage != "raw":
        raise ValidationException(f"当前 extraction_result stage={result_row.stage} 不可校验")

    ai_fields = await _load_ai_standard_fields(db)
    enum_options = _build_enum_options(ai_fields)

    task.current_step = "STEP8_VALIDATE"
    task.error_message = None
    await db.flush()

    try:
        validated_fields = validate_extracted_fields(
            result_row.fields or {},
            enum_options=enum_options,
        )
        result_row.fields = validated_fields
        result_row.stage = "validated"
        task.status = "VALIDATING"
        task.current_step = "STEP8_VALIDATE_DONE"
        await db.commit()
        await db.refresh(result_row)

        return Step8ValidateOutput(
            task_id=task.task_no,
            result=ExtractionResultOut.from_row(result_row),
        )
    except Exception as exc:
        task.status = "FAILED"
        task.current_step = "STEP8_VALIDATE"
        task.error_message = str(exc)
        await db.commit()
        raise


async def _load_prompt_field_codes(db: AsyncSession, task: ExtractionTask) -> list[str]:
    prompt_row = (
        await db.execute(
            select(ExtractionPrompt).where(ExtractionPrompt.task_id == task.id)
        )
    ).scalar_one_or_none()
    if prompt_row and prompt_row.field_codes:
        return list(prompt_row.field_codes)

    ai_fields = await _load_ai_standard_fields(db)
    return [field.field_code for field in ai_fields]


@timed_extraction_step("step9_detect_missing")
async def run_detect_missing(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> Step9DetectMissingOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    result_row = (
        await db.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one_or_none()
    if not result_row:
        raise ValidationException("请先执行 Step7 字段提取")
    if result_row.stage == "final":
        await sync_task_progress(
            db,
            task,
            status="MAPPING",
            current_step="STEP9_DETECT_MISSING_DONE",
        )
        return Step9DetectMissingOutput(
            task_id=task.task_no,
            result=ExtractionResultOut.from_row(result_row),
        )

    if result_row.stage != "validated":
        raise ValidationException("请先执行 Step8 字段校验")

    schema_field_codes = await _load_prompt_field_codes(db, task)

    task.current_step = "STEP9_DETECT_MISSING"
    task.error_message = None
    await db.flush()

    try:
        final_fields = detect_missing_fields(
            result_row.fields or {},
            schema_field_codes,
        )
        result_row.fields = final_fields
        result_row.stage = "final"
        task.status = "MAPPING"
        task.current_step = "STEP9_DETECT_MISSING_DONE"
        await db.commit()
        await db.refresh(result_row)

        return Step9DetectMissingOutput(
            task_id=task.task_no,
            result=ExtractionResultOut.from_row(result_row),
        )
    except Exception as exc:
        task.status = "FAILED"
        task.current_step = "STEP9_DETECT_MISSING"
        task.error_message = str(exc)
        await db.commit()
        raise


async def _resolve_insurance_company(
    db: AsyncSession, insurance_company: str
) -> InsuranceCompany | None:
    key = insurance_company.strip()
    if not key:
        return None
    row = (
        await db.execute(
            select(InsuranceCompany).where(
                InsuranceCompany.company_code.ilike(key)
                | InsuranceCompany.company_name.ilike(f"%{key}%")
                | InsuranceCompany.company_name_en.ilike(f"%{key}%")
            )
        )
    ).scalars().first()
    return row


async def _resolve_policy_template(
    db: AsyncSession, *, clinic_id: int, company_id: int
) -> PolicyTemplate | None:
    clinic_template = (
        await db.execute(
            select(PolicyTemplate)
            .join(
                ClinicPolicyTemplate,
                ClinicPolicyTemplate.template_id == PolicyTemplate.id,
            )
            .where(
                ClinicPolicyTemplate.clinic_id == clinic_id,
                PolicyTemplate.company_id == company_id,
                PolicyTemplate.is_active.is_(True),
            )
            .order_by(PolicyTemplate.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if clinic_template:
        return clinic_template

    return (
        await db.execute(
            select(PolicyTemplate)
            .where(
                PolicyTemplate.company_id == company_id,
                PolicyTemplate.is_active.is_(True),
            )
            .order_by(PolicyTemplate.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _load_template_field_mapping(
    db: AsyncSession,
    *,
    clinic_id: int,
    insurance_company: str,
) -> tuple[int | None, dict[str, str], str]:
    company = await _resolve_insurance_company(db, insurance_company)
    if not company:
        fallback = resolve_fallback_mapping(insurance_company)
        return None, fallback, "fallback" if fallback else "identity"

    template = await _resolve_policy_template(db, clinic_id=clinic_id, company_id=company.id)
    if not template:
        fallback = resolve_fallback_mapping(insurance_company)
        return None, fallback, "fallback" if fallback else "identity"

    rows = (
        await db.execute(
            select(
                StandardField.field_code,
                TemplateField.pdf_field_name,
                TemplateField.field_label_raw,
            )
            .join(
                TemplateFieldMapping,
                TemplateFieldMapping.standard_field_id == StandardField.id,
            )
            .join(TemplateField, TemplateField.id == TemplateFieldMapping.template_field_id)
            .where(
                TemplateField.template_id == template.id,
                TemplateField.field_status == "MAPPED",
                TemplateFieldMapping.standard_field_id.is_not(None),
            )
        )
    ).all()

    mapping: dict[str, str] = {}
    for field_code, pdf_name, label in rows:
        insurer_key = (pdf_name or label or field_code).strip()
        mapping[field_code] = insurer_key

    if mapping:
        return template.id, mapping, "template"

    fallback = resolve_fallback_mapping(insurance_company)
    return template.id, fallback, "fallback" if fallback else "identity"


async def _load_template_field_mapping_by_id(
    db: AsyncSession, *, template_id: int
) -> tuple[int | None, dict[str, str], str]:
    template = await db.get(PolicyTemplate, template_id)
    if not template or not template.is_active:
        return None, {}, "identity"

    rows = (
        await db.execute(
            select(
                StandardField.field_code,
                TemplateField.pdf_field_name,
                TemplateField.field_label_raw,
            )
            .join(
                TemplateFieldMapping,
                TemplateFieldMapping.standard_field_id == StandardField.id,
            )
            .join(TemplateField, TemplateField.id == TemplateFieldMapping.template_field_id)
            .where(
                TemplateField.template_id == template.id,
                TemplateField.field_status == "MAPPED",
                TemplateFieldMapping.standard_field_id.is_not(None),
            )
        )
    ).all()

    mapping: dict[str, str] = {}
    for field_code, pdf_name, label in rows:
        insurer_key = (pdf_name or label or field_code).strip()
        mapping[field_code] = insurer_key

    if mapping:
        return template.id, mapping, "template"
    return template.id, {}, "identity"


async def _resolve_mapping_for_task(
    db: AsyncSession,
    *,
    clinic_id: int,
    classification_row: DocumentClassification,
    data: Step10MapInput | FinalizeExtractionInput | None,
) -> tuple[int | None, dict[str, str], str, str]:
    template_id = getattr(data, "template_id", None) if data else None
    if template_id:
        tid, mapping, source = await _load_template_field_mapping_by_id(
            db, template_id=template_id
        )
        insurance_company = classification_row.insurance_company or "UNKNOWN"
        return tid, mapping, source, insurance_company

    insurance_company = (
        (getattr(data, "insurance_company", None) if data else None)
        or classification_row.insurance_company
        or "UNKNOWN"
    )
    tid, mapping, source = await _load_template_field_mapping(
        db,
        clinic_id=clinic_id,
        insurance_company=insurance_company,
    )
    return tid, mapping, source, insurance_company


@timed_extraction_step("step10_map_insurance")
async def run_map_to_insurance(
    db: AsyncSession,
    *,
    task_no: str,
    clinic_id: int,
    data: Step10MapInput | None = None,
) -> Step10MapOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    existing_mapped = (
        await db.execute(
            select(ExtractionMappedResult).where(
                ExtractionMappedResult.task_id == task.id
            )
        )
    ).scalar_one_or_none()
    if existing_mapped:
        await sync_task_progress(
            db,
            task,
            status="REVIEW",
            current_step="STEP10_MAP_INSURANCE_DONE",
        )
        return Step10MapOutput(
            task_id=task.task_no,
            result=ExtractionMappedResultOut.from_row(existing_mapped),
        )

    result_row = (
        await db.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one_or_none()
    if not result_row:
        raise ValidationException("请先执行 Step7 字段提取")
    if result_row.stage != "final":
        raise ValidationException("请先执行 Step9 缺失检测")

    classification_row = await _load_classification_row(db, task)
    template_id, field_mapping, mapping_source, insurance_company = (
        await _resolve_mapping_for_task(
            db,
            clinic_id=clinic_id,
            classification_row=classification_row,
            data=data,
        )
    )

    task.current_step = "STEP10_MAP_INSURANCE"
    task.error_message = None
    await db.flush()

    try:
        mapped_fields, unmapped_fields = map_fields_to_insurance(
            result_row.fields or {},
            field_mapping,
            keep_unmapped=True,
        )

        existing = (
            await db.execute(
                select(ExtractionMappedResult).where(
                    ExtractionMappedResult.task_id == task.id
                )
            )
        ).scalar_one_or_none()
        if existing:
            await db.delete(existing)
            await db.flush()

        review_existing = (
            await db.execute(
                select(ExtractionReviewOutput).where(
                    ExtractionReviewOutput.task_id == task.id
                )
            )
        ).scalar_one_or_none()
        if review_existing:
            await db.delete(review_existing)
            await db.flush()

        mapped_row = ExtractionMappedResult(
            task_id=task.id,
            insurance_company=normalize_insurance_key(insurance_company),
            template_id=template_id,
            mapping_source=mapping_source,
            fields=mapped_fields,
            unmapped_fields=unmapped_fields,
        )
        db.add(mapped_row)

        task.status = "REVIEW"
        task.current_step = "STEP10_MAP_INSURANCE_DONE"
        await db.commit()
        await db.refresh(mapped_row)

        return Step10MapOutput(
            task_id=task.task_no,
            result=ExtractionMappedResultOut.from_row(mapped_row),
        )
    except Exception as exc:
        task.status = "FAILED"
        task.current_step = "STEP10_MAP_INSURANCE"
        task.error_message = str(exc)
        await db.commit()
        raise


async def run_finalize_extraction(
    db: AsyncSession,
    *,
    task_no: str,
    clinic_id: int,
    data: FinalizeExtractionInput | Step10MapInput | None = None,
) -> FinalizeExtractionOutput:
    """Step8–10 合并：校验 → 缺失检测 → 保险映射（产物驱动，幂等）。"""
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    existing_mapped = (
        await db.execute(
            select(ExtractionMappedResult).where(
                ExtractionMappedResult.task_id == task.id
            )
        )
    ).scalar_one_or_none()
    result_row = (
        await db.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one_or_none()
    if existing_mapped and result_row:
        await sync_task_progress(
            db,
            task,
            status="REVIEW",
            current_step="STEP10_MAP_INSURANCE_DONE",
        )
        return FinalizeExtractionOutput(
            task_id=task.task_no,
            extraction_result=ExtractionResultOut.from_row(result_row),
            mapped_result=ExtractionMappedResultOut.from_row(existing_mapped),
        )

    if not result_row:
        raise ValidationException("请先执行 Step7 字段提取")

    map_input = None
    if data is not None:
        map_input = Step10MapInput(
            insurance_company=getattr(data, "insurance_company", None),
            template_id=getattr(data, "template_id", None),
        )

    await run_validate(db, task_no=task_no, clinic_id=clinic_id)
    await run_detect_missing(db, task_no=task_no, clinic_id=clinic_id)
    map_output = await run_map_to_insurance(
        db,
        task_no=task_no,
        clinic_id=clinic_id,
        data=map_input,
    )

    result_row = (
        await db.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one_or_none()
    if not result_row:
        raise ValidationException("请先执行 Step7 字段提取")

    return FinalizeExtractionOutput(
        task_id=task.task_no,
        extraction_result=ExtractionResultOut.from_row(result_row),
        mapped_result=map_output.result,
    )


async def get_mapped_result(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> ExtractionMappedResultOut:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    row = (
        await db.execute(
            select(ExtractionMappedResult).where(
                ExtractionMappedResult.task_id == task.id
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundException("尚未执行 Step10 保险字段映射")
    return ExtractionMappedResultOut.from_row(row)


async def _load_text_layer_pages(
    db: AsyncSession, task: ExtractionTask
) -> list[dict[str, object]]:
    page_rows = list(
        (
            await db.execute(
                select(DocumentPage)
                .where(DocumentPage.task_id == task.id, DocumentPage.source == "text_layer")
                .order_by(DocumentPage.page_no)
            )
        ).scalars().all()
    )
    return [
        {"page": row.page_no, "text": row.text}
        for row in page_rows
        if row.text
    ]


def _ocr_rows_to_page_dicts(ocr_rows: list[OcrResult]) -> list[dict[str, object]]:
    return [
        {"page": row.page_no, "blocks": row.blocks or []}
        for row in ocr_rows
    ]


@timed_extraction_step("step11_prepare_review")
async def run_prepare_review(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> Step11PrepareReviewOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    result_row = (
        await db.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one_or_none()
    if not result_row or result_row.stage != "final":
        raise ValidationException("请先完成 Step9 缺失检测")

    mapped_row = (
        await db.execute(
            select(ExtractionMappedResult).where(
                ExtractionMappedResult.task_id == task.id
            )
        )
    ).scalar_one_or_none()
    if not mapped_row:
        raise ValidationException("请先执行 Step10 保险字段映射")

    existing_review = (
        await db.execute(
            select(ExtractionReviewOutput).where(
                ExtractionReviewOutput.task_id == task.id
            )
        )
    ).scalar_one_or_none()
    if existing_review:
        changed = await _complete_review_row_standard_fields(
            db, task=task, review_row=existing_review
        )
        await sync_task_progress(
            db,
            task,
            status="REVIEW",
            current_step="STEP11_PREPARE_REVIEW_DONE",
        )
        if changed:
            await db.commit()
        return Step11PrepareReviewOutput(
            task_id=task.task_no,
            review=await _review_output_out(
                db, task=task, review_row=existing_review
            ),
        )

    ocr_rows, _ = await _load_ocr_pages(db, task)
    text_layer_pages = await _load_text_layer_pages(db, task)
    active_fields = await _load_active_standard_fields(db)
    template_codes, _ = await _template_specific_meta_for_task(db, task)
    standard_fields = build_standard_review_fields(
        result_row.fields or {},
        ocr_pages=_ocr_rows_to_page_dicts(ocr_rows),
        text_layer_pages=text_layer_pages,
        standard_field_codes=[field.field_code for field in active_fields]
        + template_codes,
        system_values=await _build_system_review_values(db, task),
    )

    classification_row = await _load_classification_row(db, task)
    insurance_company = (
        mapped_row.insurance_company or classification_row.insurance_company
    )

    task.current_step = "STEP11_PREPARE_REVIEW"
    task.error_message = None
    await db.flush()

    review_row = ExtractionReviewOutput(
        task_id=task.id,
        insurance_company=insurance_company,
        standard_fields=standard_fields,
        edited_fields=None,
        mapped_fields=mapped_row.fields,
        is_confirmed=False,
        reviewed_by_id=None,
        reviewed_at=None,
    )
    db.add(review_row)
    task.status = "REVIEW"
    task.current_step = "STEP11_PREPARE_REVIEW_DONE"
    await db.commit()
    await db.refresh(review_row)

    return Step11PrepareReviewOutput(
        task_id=task.task_no,
        review=await _review_output_out(db, task=task, review_row=review_row),
    )


async def get_review_output(
    db: AsyncSession, *, task_no: str, clinic_id: int
) -> ExtractionReviewOutputOut:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    row = (
        await db.execute(
            select(ExtractionReviewOutput).where(
                ExtractionReviewOutput.task_id == task.id
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise NotFoundException("尚未生成 Step11 标准审核 JSON，请先执行 prepare-review")
    if await _complete_review_row_standard_fields(db, task=task, review_row=row):
        await db.commit()
    return await _review_output_out(db, task=task, review_row=row)


async def save_review_output(
    db: AsyncSession,
    *,
    task_no: str,
    clinic_id: int,
    doctor_id: int,
    data: Step11SaveReviewInput,
) -> Step11SaveReviewOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    reject_if_failed(task)

    row = (
        await db.execute(
            select(ExtractionReviewOutput).where(
                ExtractionReviewOutput.task_id == task.id
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise ValidationException("请先执行 Step11 生成标准 JSON")

    edits = {
        code: {"value": field.value}
        for code, field in data.fields.items()
    }
    merged_edits = dict(row.edited_fields or {})
    merged_edits.update(
        apply_doctor_field_edits(row.standard_fields or {}, edits)
    )

    row.edited_fields = merged_edits
    row.reviewed_by_id = doctor_id
    row.reviewed_at = datetime.now(UTC)
    row.is_confirmed = False
    task.status = "REVIEW"
    task.current_step = "STEP11_REVIEW_SAVED"
    await db.commit()
    await db.refresh(row)

    return Step11SaveReviewOutput(
        task_id=task.task_no,
        review=await _review_output_out(db, task=task, review_row=row),
    )


async def confirm_review(
    db: AsyncSession,
    *,
    task_no: str,
    clinic_id: int,
    doctor_id: int,
) -> Step11ConfirmReviewOutput:
    task = await get_task(db, task_no=task_no, clinic_id=clinic_id)
    row = (
        await db.execute(
            select(ExtractionReviewOutput).where(
                ExtractionReviewOutput.task_id == task.id
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise ValidationException("请先执行 Step11 生成标准 JSON")

    row.reviewed_by_id = doctor_id
    row.reviewed_at = datetime.now(UTC)
    row.is_confirmed = True
    task.status = "COMPLETED"
    task.current_step = "STEP11_REVIEW_CONFIRMED"
    await db.commit()
    await db.refresh(row)

    return Step11ConfirmReviewOutput(
        task_id=task.task_no,
        review=await _review_output_out(db, task=task, review_row=row),
    )
