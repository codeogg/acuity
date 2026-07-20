"""Step1 上传 PDF 单测。"""
import pytest
from sqlalchemy import select

from src.core.exceptions import ValidationException
from src.db.models import ExtractionTask
from src.modules.pdf_extraction.schemas import Step1UploadInput
from src.modules.pdf_extraction.steps.step1_upload import _validate_pdf, run_step1_upload

MINIMAL_PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF"


def test_step1_rejects_non_pdf():
    with pytest.raises(ValidationException, match="仅支持 PDF"):
        _validate_pdf("bad.txt", b"not a pdf")


@pytest.mark.asyncio
async def test_step1_upload_creates_task(db_session, demo_clinic_doctor):
    clinic, doctor = demo_clinic_doctor
    data = Step1UploadInput(
        clinic_id=clinic.id,
        doctor_id=doctor.id,
        original_filename="record.pdf",
        patient_name="陈大文",
    )

    result = await run_step1_upload(db_session, data, MINIMAL_PDF)
    await db_session.commit()

    assert result.status == "WAITING"
    assert result.task_id.startswith("EXT")
    assert result.patient_name == "陈大文"
    assert result.file_size_bytes == len(MINIMAL_PDF)
    assert result.pdf_url

    row = (
        await db_session.execute(
            select(ExtractionTask).where(ExtractionTask.task_no == result.task_id)
        )
    ).scalar_one()
    assert row.status == "WAITING"
    assert row.current_step == "STEP1_UPLOAD"
