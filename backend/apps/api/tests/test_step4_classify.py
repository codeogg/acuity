"""Step4 文档分类单测。"""
import uuid

import pytest
from sqlalchemy import select

from src.db.models import DocumentClassification, ExtractionTask, OcrResult
from src.modules.pdf_extraction.ai_service import (
    ClassificationInvokeResult,
    DocumentClassificationResult,
    set_document_classifier,
)
from src.modules.pdf_extraction.ai_service.gemini_classifier import normalize_classification
from src.modules.pdf_extraction.schemas import OcrBlockOut, Step3PageOcrOutput
from src.modules.pdf_extraction.service import run_classify
from src.modules.pdf_extraction.steps.step4_classify import (
    MAX_CLASSIFY_CHARS,
    assemble_document_text,
)


class MockClassifier:
    def __init__(self, *, need_visit_selector: bool = True) -> None:
        self._need_visit_selector = need_visit_selector

    async def classify(self, document_text: str) -> ClassificationInvokeResult:
        assert "Patient Name" in document_text
        return ClassificationInvokeResult(
            classification=DocumentClassificationResult(
                document_type="Outpatient_Receipt",
                language="zh-en",
                multiple_patient=False,
                multiple_visit=True,
                insurance_company="AIA",
                need_visit_selector=self._need_visit_selector,
            ),
            model_name="mock-classifier",
            token_usage=99,
            stub=True,
        )


def test_assemble_document_text_truncates_pages_and_chars():
    pages = [
        Step3PageOcrOutput(
            task_id="T1",
            page=i,
            blocks=[OcrBlockOut(text=f"line-{i}-" + ("x" * 5000), bbox=None, confidence=1.0)],
        )
        for i in range(1, 8)
    ]
    text, pages_used, char_count = assemble_document_text(
        pages, max_pages=3, max_chars=800
    )
    assert pages_used <= 3
    assert char_count <= 800
    assert len(text) <= 800
    assert "--- Page 1 ---" in text


def test_assemble_document_text_respects_max_chars():
    long_text = "A" * (MAX_CLASSIFY_CHARS + 500)
    pages = [
        Step3PageOcrOutput(
            task_id="T1",
            page=1,
            blocks=[OcrBlockOut(text=long_text, bbox=None, confidence=1.0)],
        )
    ]
    text, pages_used, char_count = assemble_document_text(pages)
    assert pages_used == 1
    assert char_count <= MAX_CLASSIFY_CHARS
    assert len(text) <= MAX_CLASSIFY_CHARS


def test_normalize_classification_sets_need_visit_selector():
    raw = DocumentClassificationResult(
        document_type="Bill",
        language="zh",
        multiple_patient=False,
        multiple_visit=True,
        insurance_company=None,
        need_visit_selector=False,
    )
    normalized = normalize_classification(raw)
    assert normalized.need_visit_selector is True


@pytest.mark.asyncio
async def test_run_classify_status_routing(db_session, demo_clinic_doctor):
    clinic, doctor = demo_clinic_doctor
    scenarios = [(True, "VISIT_SELECT"), (False, "EXTRACTING")]

    for need_visit_selector, expected_status in scenarios:
        task_no = f"EXTTESTCLS{uuid.uuid4().hex[:8].upper()}"
        task = ExtractionTask(
            task_no=task_no,
            clinic_id=clinic.id,
            doctor_id=doctor.id,
            original_filename="record.pdf",
            pdf_url="/local-storage/test.pdf",
            file_size_bytes=100,
            status="CLASSIFYING",
            current_step="STEP3_OCR_DONE",
        )
        db_session.add(task)
        await db_session.flush()

        db_session.add(
            OcrResult(
                task_id=task.id,
                page_no=1,
                blocks=[
                    {"text": "Patient Name: Chan Tai Man", "bbox": None, "confidence": 1.0}
                ],
            )
        )
        await db_session.commit()

        set_document_classifier(MockClassifier(need_visit_selector=need_visit_selector))
        try:
            output = await run_classify(
                db_session, task_no=task.task_no, clinic_id=clinic.id
            )
        finally:
            set_document_classifier(None)

        assert output.status == expected_status
        assert output.classification.document_type == "Outpatient_Receipt"
        assert output.classification.need_visit_selector is need_visit_selector

        row = (
            await db_session.execute(
                select(DocumentClassification).where(
                    DocumentClassification.task_id == task.id
                )
            )
        ).scalar_one()
        assert row.need_visit_selector is need_visit_selector

        task_row = (
            await db_session.execute(
                select(ExtractionTask).where(ExtractionTask.id == task.id)
            )
        ).scalar_one()
        assert task_row.status == expected_status
