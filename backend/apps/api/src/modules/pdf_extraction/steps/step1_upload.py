"""Step1：上传 PDF 至 MinIO（无 AI）。

输入/输出契约见 schemas.Step1UploadInput / Step1UploadOutput。
"""
import secrets
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ValidationException
from src.db.models import ExtractionTask
from src.modules.pdf_extraction.schemas import Step1UploadInput, Step1UploadOutput
from src.utils import storage

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


def _gen_task_no() -> str:
    return f"EXT{datetime.now(UTC):%Y%m%d}{secrets.token_hex(4).upper()}"


def _validate_pdf(filename: str, file_bytes: bytes) -> None:
    if not filename.lower().endswith(".pdf"):
        raise ValidationException("仅支持 PDF 文件")
    if len(file_bytes) == 0:
        raise ValidationException("文件不能为空")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValidationException("文件大小不能超过 20MB")
    if not file_bytes.startswith(b"%PDF"):
        raise ValidationException("文件内容不是有效的 PDF")


async def run_step1_upload(
    db: AsyncSession,
    data: Step1UploadInput,
    file_bytes: bytes,
) -> Step1UploadOutput:
    """Step1 独立可测入口：校验 PDF → 存储 → 创建 extraction_task。"""
    _validate_pdf(data.original_filename, file_bytes)

    task_no = _gen_task_no()
    storage_key = f"medical-records/{data.clinic_id}/{task_no}/original.pdf"
    pdf_url = storage.upload_bytes(
        file_bytes, storage_key, content_type="application/pdf"
    )

    task = ExtractionTask(
        task_no=task_no,
        clinic_id=data.clinic_id,
        doctor_id=data.doctor_id,
        patient_name=data.patient_name,
        original_filename=data.original_filename,
        pdf_url=pdf_url,
        file_size_bytes=len(file_bytes),
        status="WAITING",
        current_step="STEP1_UPLOAD",
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)

    return Step1UploadOutput(
        task_id=task.task_no,
        status="WAITING",
        clinic_id=task.clinic_id,
        doctor_id=task.doctor_id,
        patient_name=task.patient_name,
        original_filename=task.original_filename,
        pdf_url=task.pdf_url,
        file_size_bytes=task.file_size_bytes,
        created_at=task.created_at,
    )
