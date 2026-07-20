"""病历 PDF 提取编排任务（arq 后台执行）。"""
from __future__ import annotations

from typing import Any

from src.core.ai_usage_context import reset_ai_call_context, set_ai_call_context
from src.core.logging import get_logger
from src.db.models import ClaimSubmission, ExtractionTask
from src.db.session import async_session_factory
from src.modules.pdf_extraction import service as pdf_service
from src.modules.pdf_extraction.schemas import (
    FinalizeExtractionInput,
    Step5SelectVisitInput,
)
from src.modules.pdf_extraction.document_parser import uses_mineru
from src.modules.pdf_extraction.step_timing import (
    begin_pipeline_timing,
    log_pipeline_timing_summary,
)
from src.tasks.extraction_progress import report_extraction_progress

logger = get_logger(__name__)


class ExtractionCancelled(Exception):
    """用户取消识别或任务已被新 job 取代。"""


async def _set_state(
    claim: ClaimSubmission,
    *,
    status: str,
    stage: str,
    progress: int,
    message: str,
    manifest: dict | None = None,
) -> None:
    claim.extract_status = status
    claim.extract_stage = stage
    claim.extract_progress = progress
    claim.extract_message = message
    if manifest is not None:
        claim.extract_manifest = manifest


async def _report(sid: int, *, percent: int, message: str, stage: str, status: str) -> None:
    await report_extraction_progress(sid, percent, message, stage=stage, status=status)


async def _ensure_job_active(
    db, *, claim: ClaimSubmission, job_id: str | None
) -> None:
    """取消识别后 extract_status=IDLE；旧 worker 应立即退出且不再写状态。"""
    await db.refresh(claim)
    if claim.extract_status == "IDLE":
        raise ExtractionCancelled("extraction cancelled by user")
    if job_id and claim.extract_job_id and claim.extract_job_id != job_id:
        raise ExtractionCancelled("extraction job superseded")


async def _post_visit(
    db,
    *,
    claim: ClaimSubmission,
    clinic_id: int,
    task_no: str,
    template_id: int,
    job_id: str | None,
) -> None:
    sid = claim.id

    await _ensure_job_active(db, claim=claim, job_id=job_id)
    await _set_state(claim, status="RUNNING", stage="EXTRACT", progress=65, message="AI 提取准备中")
    await db.commit()
    await _report(sid, percent=65, message="AI 提取准备中", stage="EXTRACT", status="RUNNING")
    await pdf_service.run_build_prompt(db, task_no=task_no, clinic_id=clinic_id)

    await _ensure_job_active(db, claim=claim, job_id=job_id)
    await _set_state(claim, status="RUNNING", stage="EXTRACT", progress=75, message="AI 字段提取中")
    await db.commit()
    await _report(sid, percent=75, message="AI 字段提取中", stage="EXTRACT", status="RUNNING")
    await pdf_service.run_extract_fields(db, task_no=task_no, clinic_id=clinic_id)

    await _ensure_job_active(db, claim=claim, job_id=job_id)
    await _set_state(
        claim, status="RUNNING", stage="VALIDATE", progress=88, message="字段校验与映射中"
    )
    await db.commit()
    await _report(sid, percent=88, message="字段校验与映射中", stage="VALIDATE", status="RUNNING")
    await pdf_service.run_finalize_extraction(
        db,
        task_no=task_no,
        clinic_id=clinic_id,
        data=FinalizeExtractionInput(template_id=template_id),
    )

    await _ensure_job_active(db, claim=claim, job_id=job_id)
    await _set_state(claim, status="RUNNING", stage="VALIDATE", progress=95, message="生成核对数据中")
    await db.commit()
    await _report(sid, percent=95, message="生成核对数据中", stage="VALIDATE", status="RUNNING")
    await pdf_service.run_prepare_review(db, task_no=task_no, clinic_id=clinic_id)

    await _ensure_job_active(db, claim=claim, job_id=job_id)
    await _set_state(
        claim, status="DONE", stage="DONE", progress=100, message="提取完成", manifest=None
    )
    await db.commit()
    await _report(sid, percent=100, message="提取完成", stage="DONE", status="DONE")


async def _maybe_pause_for_visit(
    db, *, claim: ClaimSubmission, clinic_id: int, task_no: str, job_id: str | None
) -> bool:
    classification = await pdf_service.get_classification(
        db, task_no=task_no, clinic_id=clinic_id
    )
    if not classification.need_visit_selector:
        return False

    visits = await pdf_service.list_visits(db, task_no=task_no, clinic_id=clinic_id)
    if not visits:
        await _ensure_job_active(db, claim=claim, job_id=job_id)
        await _set_state(
            claim, status="RUNNING", stage="CLASSIFY", progress=55, message="就诊记录检测中"
        )
        await db.commit()
        await _report(
            claim.id, percent=55, message="就诊记录检测中", stage="CLASSIFY", status="RUNNING"
        )
        detected = await pdf_service.run_detect_visits(
            db, task_no=task_no, clinic_id=clinic_id
        )
        visits = detected.visits

    if not visits:
        return False
    if len(visits) == 1:
        await pdf_service.select_visit(
            db,
            task_no=task_no,
            clinic_id=clinic_id,
            data=Step5SelectVisitInput(visit_index=visits[0].visit_index),
        )
        return False
    if any(v.selected for v in visits):
        return False

    await _ensure_job_active(db, claim=claim, job_id=job_id)
    manifest = {"task_no": task_no, "visits": [v.model_dump(mode="json") for v in visits]}
    await _set_state(
        claim,
        status="AWAITING_INPUT",
        stage="AWAITING_INPUT",
        progress=58,
        message="请选择就诊记录",
        manifest=manifest,
    )
    await db.commit()
    await _report(
        claim.id,
        percent=58,
        message="请选择就诊记录",
        stage="AWAITING_INPUT",
        status="AWAITING_INPUT",
    )
    return True


async def run_extraction_pipeline(
    ctx: Any,
    submission_id: int,
    resume_from_stage: str | None = None,
    visit_index: int | None = None,
) -> None:
    async with async_session_factory() as db:
        claim = await db.get(ClaimSubmission, submission_id)
        if not claim or not claim.extraction_task_id:
            return
        task = await db.get(ExtractionTask, claim.extraction_task_id)
        if not task:
            return

        clinic_id, task_no, template_id = claim.clinic_id, task.task_no, claim.template_id
        job_id = claim.extract_job_id
        begin_pipeline_timing()
        usage_context_token = set_ai_call_context(
            purpose="pdf_extraction",
            clinic_id=claim.clinic_id,
            doctor_id=claim.doctor_id,
            submission_id=claim.id,
        )

        try:
            await _ensure_job_active(db, claim=claim, job_id=job_id)

            if resume_from_stage == "stage2":
                if visit_index is None:
                    raise ValueError("续跑需要 visit_index")
                await _set_state(
                    claim,
                    status="RUNNING",
                    stage="EXTRACT",
                    progress=60,
                    message="已选择就诊，继续提取",
                    manifest=None,
                )
                await db.commit()
                await _report(
                    submission_id,
                    percent=60,
                    message="已选择就诊，继续提取",
                    stage="EXTRACT",
                    status="RUNNING",
                )
                await pdf_service.select_visit(
                    db,
                    task_no=task_no,
                    clinic_id=clinic_id,
                    data=Step5SelectVisitInput(visit_index=visit_index),
                )
                await _post_visit(
                    db,
                    claim=claim,
                    clinic_id=clinic_id,
                    task_no=task_no,
                    template_id=template_id,
                    job_id=job_id,
                )
                return

            await db.refresh(task)
            if task.status in ("REVIEW", "COMPLETED"):
                await _ensure_job_active(db, claim=claim, job_id=job_id)
                await _set_state(
                    claim, status="DONE", stage="DONE", progress=100, message="提取完成"
                )
                await db.commit()
                return

            await _ensure_job_active(db, claim=claim, job_id=job_id)
            await _set_state(
                claim, status="RUNNING", stage="INGEST", progress=8, message="PDF 预处理中"
            )
            await db.commit()
            await _report(
                submission_id,
                percent=8,
                message="PDF 预处理中",
                stage="INGEST",
                status="RUNNING",
            )

            if task.status == "WAITING":
                await pdf_service.run_preprocess(db, task_no=task_no, clinic_id=clinic_id)
            await db.refresh(task)

            await _ensure_job_active(db, claim=claim, job_id=job_id)
            if task.status in ("OCR", "PREPROCESSING"):
                pages = await pdf_service.list_document_pages(
                    db, task_no=task_no, clinic_id=clinic_id
                )
                if uses_mineru():
                    label = "MinerU 文档解析中"
                else:
                    label = (
                        "OCR 识别中"
                        if any(p.source == "ocr_required" for p in pages)
                        else "文本层解析中"
                    )
                await _set_state(
                    claim, status="RUNNING", stage="INGEST", progress=25, message=label
                )
                await db.commit()
                await _report(
                    submission_id, percent=25, message=label, stage="INGEST", status="RUNNING"
                )
                if task.status == "OCR":
                    await pdf_service.run_ocr(db, task_no=task_no, clinic_id=clinic_id)
                await db.refresh(task)

            await _ensure_job_active(db, claim=claim, job_id=job_id)
            if task.status == "CLASSIFYING":
                await _set_state(
                    claim, status="RUNNING", stage="CLASSIFY", progress=45, message="文档分类中"
                )
                await db.commit()
                await pdf_service.run_classify(db, task_no=task_no, clinic_id=clinic_id)
                await db.refresh(task)

            await _ensure_job_active(db, claim=claim, job_id=job_id)
            if task.status == "VISIT_SELECT":
                if await _maybe_pause_for_visit(
                    db, claim=claim, clinic_id=clinic_id, task_no=task_no, job_id=job_id
                ):
                    return
                await db.refresh(task)

            await _ensure_job_active(db, claim=claim, job_id=job_id)
            if task.status in ("EXTRACTING", "VALIDATING", "MAPPING", "REVIEW"):
                await _post_visit(
                    db,
                    claim=claim,
                    clinic_id=clinic_id,
                    task_no=task_no,
                    template_id=template_id,
                    job_id=job_id,
                )
        except ExtractionCancelled as exc:
            logger.info(
                "extraction_pipeline_cancelled",
                submission_id=submission_id,
                reason=str(exc),
            )
            return
        except Exception as exc:
            logger.error("extraction_pipeline_failed", submission_id=submission_id, error=str(exc))
            # 若用户已取消，勿覆盖 IDLE
            await db.refresh(claim)
            if claim.extract_status == "IDLE":
                return
            if job_id and claim.extract_job_id and claim.extract_job_id != job_id:
                return
            err = str(exc)[:255]
            await _set_state(
                claim, status="FAILED", stage="FAILED", progress=0, message=f"提取失败：{err}"
            )
            await db.commit()
            await _report(
                submission_id,
                percent=0,
                message=f"提取失败：{err}",
                stage="FAILED",
                status="FAILED",
            )
            raise
        finally:
            reset_ai_call_context(usage_context_token)
            log_pipeline_timing_summary(submission_id=submission_id, task_no=task_no)
