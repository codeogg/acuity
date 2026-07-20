"""Step8–10 合并后处理单测。"""
import uuid

import pytest
from sqlalchemy import select

from src.db.models import (
    DocumentClassification,
    ExtractionMappedResult,
    ExtractionResult,
    ExtractionTask,
    OcrResult,
)
from src.modules.pdf_extraction.ai_service.field_extractor import (
    ExtractedFieldValue,
    FieldExtractionInvokeResult,
    set_field_extractor,
)
from src.modules.pdf_extraction.service import (
    run_build_prompt,
    run_extract_fields,
    run_finalize_extraction,
)
from tests.test_step7_extract_fields import MockFieldExtractor


@pytest.mark.asyncio
async def test_run_finalize_extraction_from_validating(db_session, demo_clinic_doctor):
    clinic, doctor = demo_clinic_doctor
    task_no = f"EXTTESTFIN{uuid.uuid4().hex[:8].upper()}"
    task = ExtractionTask(
        task_no=task_no,
        clinic_id=clinic.id,
        doctor_id=doctor.id,
        original_filename="record.pdf",
        pdf_url="/local-storage/test.pdf",
        file_size_bytes=100,
        status="EXTRACTING",
        current_step="STEP5_VISIT_SELECTED",
    )
    db_session.add(task)
    await db_session.flush()

    db_session.add(
        DocumentClassification(
            task_id=task.id,
            document_type="Hospital_Discharge",
            language="zh-en",
            multiple_patient=False,
            multiple_visit=False,
            insurance_company="AIA",
            need_visit_selector=False,
            source_text_chars=100,
            source_pages_used=1,
            model_name="mock",
            token_usage=1,
            stub=True,
        )
    )
    db_session.add(
        OcrResult(
            task_id=task.id,
            page_no=1,
            blocks=[
                {
                    "text": "Patient Name: Chan Tai Man\nDiagnosis: Acute appendicitis",
                    "bbox": None,
                    "confidence": 1.0,
                }
            ],
        )
    )
    await db_session.commit()

    set_field_extractor(MockFieldExtractor())
    try:
        await run_build_prompt(db_session, task_no=task.task_no, clinic_id=clinic.id)
        await run_extract_fields(db_session, task_no=task.task_no, clinic_id=clinic.id)

        output = await run_finalize_extraction(
            db_session, task_no=task.task_no, clinic_id=clinic.id
        )
        again = await run_finalize_extraction(
            db_session, task_no=task.task_no, clinic_id=clinic.id
        )
    finally:
        set_field_extractor(None)

    assert output.status == "REVIEW"
    assert output.extraction_result.stage == "final"
    assert output.mapped_result.insurance_company
    assert again.mapped_result.created_at == output.mapped_result.created_at

    task_row = (
        await db_session.execute(
            select(ExtractionTask).where(ExtractionTask.id == task.id)
        )
    ).scalar_one()
    assert task_row.status == "REVIEW"

    mapped_row = (
        await db_session.execute(
            select(ExtractionMappedResult).where(
                ExtractionMappedResult.task_id == task.id
            )
        )
    ).scalar_one()
    assert mapped_row.fields

    result_row = (
        await db_session.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one()
    assert result_row.stage == "final"
