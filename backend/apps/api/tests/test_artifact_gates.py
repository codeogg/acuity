"""方案 A：产物驱动门控单测。"""
import uuid

import pytest
from sqlalchemy import select

from src.db.models import (
    DocumentClassification,
    ExtractionMappedResult,
    ExtractionResult,
    ExtractionTask,
    ExtractionVisit,
    OcrResult,
)
from src.modules.pdf_extraction.ai_service.field_extractor import (
    ExtractedFieldValue,
    FieldExtractionInvokeResult,
    set_field_extractor,
)
from src.modules.pdf_extraction.schemas import Step5SelectVisitInput
from src.modules.pdf_extraction.service import (
    run_extract_fields,
    run_finalize_extraction,
    select_visit,
)
from tests.test_step7_extract_fields import MockFieldExtractor


@pytest.mark.asyncio
async def test_finalize_extraction_works_when_status_still_extracting(
    db_session, demo_clinic_doctor
):
    """Step7 后 status 仍为 EXTRACTING 时，finalize 不应 422。"""
    clinic, doctor = demo_clinic_doctor
    task_no = f"EXTTESTART{uuid.uuid4().hex[:8].upper()}"
    task = ExtractionTask(
        task_no=task_no,
        clinic_id=clinic.id,
        doctor_id=doctor.id,
        original_filename="record.pdf",
        pdf_url="/local-storage/test.pdf",
        file_size_bytes=100,
        status="EXTRACTING",
        current_step="STEP7_EXTRACT_FIELDS_DONE",
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
            blocks=[{"text": "Patient: Chan", "bbox": None, "confidence": 1.0}],
        )
    )
    db_session.add(
        ExtractionResult(
            task_id=task.id,
            fields={
                "patient_name": ExtractedFieldValue(
                    value="Chan",
                    status="extracted",
                    confidence=0.9,
                ).model_dump()
            },
            model_name="mock",
            token_usage=1,
            stub=True,
            stage="raw",
        )
    )
    await db_session.commit()

    output = await run_finalize_extraction(
        db_session, task_no=task.task_no, clinic_id=clinic.id
    )
    assert output.status == "REVIEW"
    assert output.extraction_result.stage == "final"
    assert output.mapped_result.insurance_company


@pytest.mark.asyncio
async def test_select_visit_idempotent_from_visit_select_status(
    db_session, demo_clinic_doctor
):
    """VISIT_SELECT 状态下重复选择同一就诊应返回 200。"""
    clinic, doctor = demo_clinic_doctor
    task_no = f"EXTTESTSEL2{uuid.uuid4().hex[:8].upper()}"
    task = ExtractionTask(
        task_no=task_no,
        clinic_id=clinic.id,
        doctor_id=doctor.id,
        original_filename="record.pdf",
        pdf_url="/local-storage/test.pdf",
        file_size_bytes=100,
        status="VISIT_SELECT",
        current_step="STEP5_DETECT_VISITS_DONE",
    )
    db_session.add(task)
    await db_session.flush()
    db_session.add(
        DocumentClassification(
            task_id=task.id,
            document_type="Hospital_Discharge",
            language="zh-en",
            multiple_patient=False,
            multiple_visit=True,
            insurance_company="AIA",
            need_visit_selector=True,
            source_text_chars=100,
            source_pages_used=1,
            model_name="mock",
            token_usage=1,
            stub=True,
        )
    )
    for idx in (1, 2):
        db_session.add(
            ExtractionVisit(
                task_id=task.id,
                visit_index=idx,
                visit_date="2024-01-01",
                summary=f"Visit {idx}",
                page_start=1,
                page_end=1,
                selected=idx == 2,
                model_name="mock",
                token_usage=1,
                stub=True,
            )
        )
    await db_session.commit()

    output = await select_visit(
        db_session,
        task_no=task.task_no,
        clinic_id=clinic.id,
        data=Step5SelectVisitInput(visit_index=2),
    )
    assert output.status == "EXTRACTING"
    assert output.selected_visit.visit_index == 2

    task_row = (
        await db_session.execute(
            select(ExtractionTask).where(ExtractionTask.id == task.id)
        )
    ).scalar_one()
    assert task_row.status == "EXTRACTING"
