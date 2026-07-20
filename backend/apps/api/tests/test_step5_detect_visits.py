"""Step5 多就诊检测/选择单测。"""
import uuid

import pytest
from sqlalchemy import select

from src.db.models import (
    DocumentClassification,
    ExtractionTask,
    ExtractionVisit,
    OcrResult,
)
from src.modules.pdf_extraction.ai_service import DocumentClassificationResult
from src.modules.pdf_extraction.ai_service.gemini_visit_detector import normalize_visits
from src.modules.pdf_extraction.ai_service.visit_detector import (
    VisitCandidateResult,
    VisitDetectionInvokeResult,
    set_visit_detector,
)
from src.modules.pdf_extraction.schemas import Step5SelectVisitInput
from src.modules.pdf_extraction.service import run_detect_visits, select_visit
from src.modules.pdf_extraction.steps.step5_detect_visits import assemble_visit_detection_text
from src.modules.pdf_extraction.schemas import OcrBlockOut, Step3PageOcrOutput


class MockVisitDetector:
    async def detect_visits(
        self,
        document_text: str,
        classification: DocumentClassificationResult,
        *,
        total_pages: int,
    ) -> VisitDetectionInvokeResult:
        assert "Patient Name" in document_text
        assert classification.multiple_visit is True
        return VisitDetectionInvokeResult(
            visits=[
                VisitCandidateResult(
                    visit_index=1,
                    visit_date="2025-01-10",
                    summary="Appendicitis",
                    page_range=[1, 1],
                ),
                VisitCandidateResult(
                    visit_index=2,
                    visit_date="2025-03-01",
                    summary="Gallstone",
                    page_range=[2, 2],
                ),
            ],
            model_name="mock-visit-detector",
            token_usage=55,
            stub=True,
        )


def test_normalize_visits_clamps_page_range():
    visits = normalize_visits(
        [
            VisitCandidateResult(
                visit_index=1,
                visit_date=None,
                summary="A",
                page_range=[0, 99],
            )
        ],
        total_pages=3,
    )
    assert visits[0].page_range == [1, 3]


def test_assemble_visit_detection_text_uses_extended_limits():
    pages = [
        Step3PageOcrOutput(
            task_id="T1",
            page=i,
            blocks=[OcrBlockOut(text=f"page-{i}", bbox=None, confidence=1.0)],
        )
        for i in range(1, 12)
    ]
    text, pages_used, _ = assemble_visit_detection_text(pages)
    assert pages_used == 11
    assert "--- Page 11 ---" in text


@pytest.mark.asyncio
async def test_run_detect_visits_and_select_visit(db_session, demo_clinic_doctor):
    clinic, doctor = demo_clinic_doctor
    task_no = f"EXTTESTVIS{uuid.uuid4().hex[:8].upper()}"
    task = ExtractionTask(
        task_no=task_no,
        clinic_id=clinic.id,
        doctor_id=doctor.id,
        original_filename="record.pdf",
        pdf_url="/local-storage/test.pdf",
        file_size_bytes=100,
        status="VISIT_SELECT",
        current_step="STEP4_CLASSIFY_DONE",
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
            source_pages_used=2,
            model_name="mock",
            token_usage=1,
            stub=True,
        )
    )
    for page_no, text in [(1, "Patient Name: Chan\nVisit 1"), (2, "Patient Name: Chan\nVisit 2")]:
        db_session.add(
            OcrResult(
                task_id=task.id,
                page_no=page_no,
                blocks=[{"text": text, "bbox": None, "confidence": 1.0}],
            )
        )
    await db_session.commit()

    set_visit_detector(MockVisitDetector())
    try:
        detect_output = await run_detect_visits(
            db_session, task_no=task.task_no, clinic_id=clinic.id
        )
        select_output = await select_visit(
            db_session,
            task_no=task.task_no,
            clinic_id=clinic.id,
            data=Step5SelectVisitInput(visit_index=2),
        )
    finally:
        set_visit_detector(None)

    assert len(detect_output.visits) == 2
    assert detect_output.visits[0].summary == "Appendicitis"
    assert select_output.status == "EXTRACTING"
    assert select_output.selected_visit.visit_index == 2
    assert select_output.selected_visit.selected is True

    rows = (
        await db_session.execute(
            select(ExtractionVisit).where(ExtractionVisit.task_id == task.id)
        )
    ).scalars().all()
    assert sum(1 for row in rows if row.selected) == 1

    task_row = (
        await db_session.execute(
            select(ExtractionTask).where(ExtractionTask.id == task.id)
        )
    ).scalar_one()
    assert task_row.status == "EXTRACTING"


@pytest.mark.asyncio
async def test_select_visit_idempotent_when_already_extracting(db_session, demo_clinic_doctor):
    clinic, doctor = demo_clinic_doctor
    task_no = f"EXTTESTSEL{uuid.uuid4().hex[:8].upper()}"
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
                selected=False,
                model_name="mock",
                token_usage=1,
                stub=True,
            )
        )
    await db_session.commit()

    first = await select_visit(
        db_session,
        task_no=task.task_no,
        clinic_id=clinic.id,
        data=Step5SelectVisitInput(visit_index=2),
    )
    second = await select_visit(
        db_session,
        task_no=task.task_no,
        clinic_id=clinic.id,
        data=Step5SelectVisitInput(visit_index=2),
    )
    assert first.status == "EXTRACTING"
    assert second.status == "EXTRACTING"
    assert second.selected_visit.visit_index == 2
