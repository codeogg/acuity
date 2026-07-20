"""产物驱动门控（方案 A）：接口以 DB 产物为准判断是否可执行/可返回；status 仅同步 UI。"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ValidationException
from src.db.models import (
    DocumentClassification,
    DocumentPage,
    ExtractionMappedResult,
    ExtractionPrompt,
    ExtractionResult,
    ExtractionReviewOutput,
    ExtractionTask,
    ExtractionVisit,
    OcrResult,
)
from src.modules.pdf_extraction.schemas import (
    Step2PageOutput,
    Step2PreprocessInput,
    Step2PreprocessOutput,
    Step3OcrOutput,
    Step3PageOcrOutput,
    OcrBlockOut,
)
from src.modules.pdf_extraction.steps.step2_preprocess import build_step2_output


def reject_if_failed(task: ExtractionTask) -> None:
    if task.status == "FAILED":
        raise ValidationException("任务已失败，请重新上传 PDF")


async def load_document_pages(
    db: AsyncSession, task_id: int
) -> list[DocumentPage]:
    return list(
        (
            await db.execute(
                select(DocumentPage)
                .where(DocumentPage.task_id == task_id)
                .order_by(DocumentPage.page_no)
            )
        ).scalars().all()
    )


async def require_document_pages(
    db: AsyncSession, task: ExtractionTask
) -> list[DocumentPage]:
    pages = await load_document_pages(db, task.id)
    if not pages:
        raise ValidationException("请先执行 Step2 预处理")
    return pages


async def load_ocr_rows(db: AsyncSession, task_id: int) -> list[OcrResult]:
    return list(
        (
            await db.execute(
                select(OcrResult)
                .where(OcrResult.task_id == task_id)
                .order_by(OcrResult.page_no)
            )
        ).scalars().all()
    )


async def require_ocr_rows(db: AsyncSession, task: ExtractionTask) -> list[OcrResult]:
    rows = await load_ocr_rows(db, task.id)
    if not rows:
        raise ValidationException("请先执行 Step3 OCR")
    return rows


async def load_classification_row(
    db: AsyncSession, task_id: int
) -> DocumentClassification | None:
    return (
        await db.execute(
            select(DocumentClassification).where(
                DocumentClassification.task_id == task_id
            )
        )
    ).scalar_one_or_none()


async def require_classification(
    db: AsyncSession, task: ExtractionTask
) -> DocumentClassification:
    row = await load_classification_row(db, task.id)
    if not row:
        raise ValidationException("未找到 document_classification，请先执行 Step4")
    return row


async def load_extraction_result(
    db: AsyncSession, task_id: int
) -> ExtractionResult | None:
    return (
        await db.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task_id)
        )
    ).scalar_one_or_none()


async def load_mapped_result(
    db: AsyncSession, task_id: int
) -> ExtractionMappedResult | None:
    return (
        await db.execute(
            select(ExtractionMappedResult).where(
                ExtractionMappedResult.task_id == task_id
            )
        )
    ).scalar_one_or_none()


async def load_prompt_row(
    db: AsyncSession, task_id: int
) -> ExtractionPrompt | None:
    return (
        await db.execute(
            select(ExtractionPrompt).where(ExtractionPrompt.task_id == task_id)
        )
    ).scalar_one_or_none()


async def load_review_row(
    db: AsyncSession, task_id: int
) -> ExtractionReviewOutput | None:
    return (
        await db.execute(
            select(ExtractionReviewOutput).where(
                ExtractionReviewOutput.task_id == task_id
            )
        )
    ).scalar_one_or_none()


async def load_visit_rows(db: AsyncSession, task_id: int) -> list[ExtractionVisit]:
    return list(
        (
            await db.execute(
                select(ExtractionVisit)
                .where(ExtractionVisit.task_id == task_id)
                .order_by(ExtractionVisit.visit_index)
            )
        ).scalars().all()
    )


async def require_visit_selected(
    db: AsyncSession, task: ExtractionTask, classification: DocumentClassification
) -> ExtractionVisit | None:
    if not classification.need_visit_selector:
        return None
    selected = (
        await db.execute(
            select(ExtractionVisit).where(
                ExtractionVisit.task_id == task.id,
                ExtractionVisit.selected.is_(True),
            )
        )
    ).scalar_one_or_none()
    if not selected:
        raise ValidationException("请先执行 Step5 并选择目标就诊")
    return selected


def document_pages_to_step2_output(
    task: ExtractionTask, pages: list[DocumentPage]
) -> Step2PreprocessOutput:
    page_outputs = [
        Step2PageOutput(
            task_id=task.task_no,
            page=page.page_no,
            source=page.source,  # type: ignore[arg-type]
            text=page.text,
            image_path=page.image_path,
        )
        for page in pages
    ]
    step_input = Step2PreprocessInput(
        task_id=task.task_no,
        clinic_id=task.clinic_id,
        pdf_url=task.pdf_url,
    )
    return build_step2_output(step_input, page_outputs)


def ocr_rows_have_text(rows: list[OcrResult]) -> bool:
    """OCR 行存在且至少有一条非空文本。"""
    for row in rows:
        for block in row.blocks or []:
            text = block.get("text", "") if isinstance(block, dict) else str(block)
            if str(text).strip():
                return True
    return False


def ocr_rows_to_step3_output(task_no: str, rows: list[OcrResult]) -> Step3OcrOutput:
    pages = [
        Step3PageOcrOutput(
            task_id=task_no,
            page=row.page_no,
            blocks=[OcrBlockOut.model_validate(block) for block in row.blocks],
        )
        for row in rows
    ]
    return Step3OcrOutput(task_id=task_no, pages=pages)


async def sync_task_progress(
    db: AsyncSession,
    task: ExtractionTask,
    *,
    status: str,
    current_step: str,
) -> None:
    if task.status != status or task.current_step != current_step:
        task.status = status
        task.current_step = current_step
        await db.commit()
