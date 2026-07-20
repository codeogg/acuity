"""Step7 字段提取单测。"""
import uuid

import pytest
from sqlalchemy import select

from src.db.models import (
    DocumentClassification,
    ExtractionPrompt,
    ExtractionResult,
    ExtractionTask,
    OcrResult,
    StandardField,
)
from src.modules.pdf_extraction.ai_service.field_extractor import (
    ExtractedFieldValue,
    FieldExtractionInvokeResult,
    set_field_extractor,
)
from src.modules.pdf_extraction.ai_service.gemini_field_extractor import (
    normalize_extracted_fields,
)
from src.modules.pdf_extraction.service import run_build_prompt, run_extract_fields


class MockFieldExtractor:
    async def extract_fields(self, prompt_text: str, fields: list[StandardField]):
        assert (
            "# OCR Content" in prompt_text
            or "# Document Content (Markdown)" in prompt_text
        )
        assert any(field.field_code == "diagnosis_text" for field in fields)
        return FieldExtractionInvokeResult(
            fields={
                "diagnosis_text": ExtractedFieldValue(
                    value="Acute appendicitis",
                    status="extracted",
                    confidence=0.93,
                ),
                "patient_name_cn": ExtractedFieldValue(
                    value=None,
                    status="missing",
                    confidence=0.0,
                ),
            },
            model_name="mock-extractor",
            token_usage=120,
            stub=True,
        )


def test_normalize_extracted_fields_fixes_empty_extracted_status():
    fields = [
        StandardField(
            field_code="hkid",
            field_name="香港身份证号码",
            domain_id=1,
            data_type="text",
            is_required=False,
            source_type="AI",
        )
    ]
    normalized = normalize_extracted_fields(
        {"hkid": {"value": None, "status": "extracted", "confidence": 0.5}},
        fields,
    )
    assert normalized["hkid"].status == "missing"


@pytest.mark.asyncio
async def test_run_build_prompt_and_extract_fields(db_session, demo_clinic_doctor):
    clinic, doctor = demo_clinic_doctor
    task_no = f"EXTTESTEXT{uuid.uuid4().hex[:8].upper()}"
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

    prompt_output = await run_build_prompt(
        db_session, task_no=task.task_no, clinic_id=clinic.id
    )
    assert "diagnosis_text" in prompt_output.prompt.field_codes
    assert (
        "# OCR Content" in prompt_output.prompt.prompt_text
        or "# Document Content (Markdown)" in prompt_output.prompt.prompt_text
    )

    set_field_extractor(MockFieldExtractor())
    try:
        extract_output = await run_extract_fields(
            db_session, task_no=task.task_no, clinic_id=clinic.id
        )
    finally:
        set_field_extractor(None)

    assert extract_output.status == "VALIDATING"
    assert (
        extract_output.result.fields["diagnosis_text"].value == "Acute appendicitis"
    )
    assert extract_output.result.fields["diagnosis_text"].status == "extracted"

    prompt_row = (
        await db_session.execute(
            select(ExtractionPrompt).where(ExtractionPrompt.task_id == task.id)
        )
    ).scalar_one()
    assert prompt_row.source_pages_used == 1

    result_row = (
        await db_session.execute(
            select(ExtractionResult).where(ExtractionResult.task_id == task.id)
        )
    ).scalar_one()
    assert result_row.stage == "raw"

    task_row = (
        await db_session.execute(
            select(ExtractionTask).where(ExtractionTask.id == task.id)
        )
    ).scalar_one()
    assert task_row.status == "VALIDATING"
