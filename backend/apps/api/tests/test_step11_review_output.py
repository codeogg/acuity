"""Step11 人工审核单测（纯本地逻辑，不调用 LLM）。"""
import uuid

import pytest
from sqlalchemy import select

from src.db.models import (
    DocumentClassification,
    ExtractionMappedResult,
    ExtractionResult,
    ExtractionReviewOutput,
    ExtractionTask,
    OcrResult,
)
from src.modules.pdf_extraction.steps.step11_review_output import (
    apply_doctor_field_edits,
    attach_field_provenance,
    build_standard_review_fields,
    complete_standard_review_fields,
    find_ocr_provenance,
    merge_review_fields_for_display,
    needs_review_highlight,
)
from src.modules.pdf_extraction.service import (
    confirm_review,
    get_review_output,
    run_prepare_review,
    save_review_output,
)
from src.modules.pdf_extraction.schemas import Step11SaveReviewInput, ReviewFieldEditIn


def test_needs_review_highlight_for_low_confidence():
    assert needs_review_highlight({"status": "extracted", "confidence": 0.7}) is True


def test_needs_review_highlight_for_missing():
    assert needs_review_highlight({"status": "missing", "confidence": 1.0}) is True


def test_find_ocr_provenance_matches_block():
    provenance = find_ocr_provenance(
        "陈大文",
        ocr_pages=[
            {
                "page": 1,
                "blocks": [
                    {"text": "姓名：陈大文", "bbox": [10, 20, 100, 30], "confidence": 0.95}
                ],
            }
        ],
    )
    assert provenance["page"] == 1
    assert provenance["bbox"] == [10, 20, 100, 30]
    assert "陈大文" in (provenance["source_text"] or "")


def test_build_standard_review_fields_attaches_provenance():
    fields = build_standard_review_fields(
        {
            "patient_name_cn": {
                "value": "陈大文",
                "status": "extracted",
                "confidence": 0.92,
                "validation_error": None,
            }
        },
        ocr_pages=[
            {
                "page": 2,
                "blocks": [
                    {"text": "Patient: 陈大文", "bbox": [1, 2, 3, 4], "confidence": 0.9}
                ],
            }
        ],
    )
    assert fields["patient_name_cn"]["page"] == 2
    assert fields["patient_name_cn"]["bbox"] == [1, 2, 3, 4]


def test_complete_standard_review_fields_adds_missing_and_system_values():
    fields = complete_standard_review_fields(
        {
            "diagnosis_text": {
                "value": "URI",
                "status": "extracted",
                "confidence": 0.88,
            }
        },
        standard_field_codes=["doctor_name", "diagnosis_text", "receipt_no"],
        system_values={"doctor_name": "陈大文"},
    )

    assert list(fields) == ["doctor_name", "diagnosis_text", "receipt_no"]
    assert fields["doctor_name"]["value"] == "陈大文"
    assert fields["doctor_name"]["status"] == "extracted"
    assert fields["receipt_no"]["status"] == "missing"


def test_apply_doctor_field_edits_marks_filled_as_extracted():
    prepared = {
        "hkid": {
            "value": None,
            "status": "missing",
            "confidence": 0.0,
            "page": None,
            "bbox": None,
        }
    }
    edited = apply_doctor_field_edits(
        prepared,
        {"hkid": {"value": "A123456(7)"}},
    )
    assert edited["hkid"]["status"] == "extracted"
    assert edited["hkid"]["confidence"] == 1.0


def test_merge_review_fields_for_display():
    merged = merge_review_fields_for_display(
        {
            "dob": {
                "value": "1990-01-01",
                "status": "extracted",
                "confidence": 0.9,
                "page": 1,
            }
        },
        {"dob": {"value": "1990-01-02", "status": "extracted", "confidence": 1.0}},
    )
    assert merged["dob"]["value"] == "1990-01-02"
    assert merged["dob"]["page"] == 1


@pytest.mark.asyncio
async def test_run_prepare_review_and_save(db_session, demo_clinic_doctor):
    clinic, doctor = demo_clinic_doctor
    task_no = f"EXTREV{uuid.uuid4().hex[:8].upper()}"
    task = ExtractionTask(
        task_no=task_no,
        clinic_id=clinic.id,
        doctor_id=doctor.id,
        original_filename="record.pdf",
        pdf_url="/local-storage/test.pdf",
        file_size_bytes=100,
        status="REVIEW",
        current_step="STEP10_MAP_INSURANCE_DONE",
    )
    db_session.add(task)
    await db_session.flush()

    db_session.add(
        DocumentClassification(
            task_id=task.id,
            document_type="outpatient_record",
            language="zh-HK",
            multiple_patient=False,
            multiple_visit=False,
            insurance_company="AIA",
            need_visit_selector=False,
            source_text_chars=100,
            source_pages_used=1,
            stub=True,
        )
    )
    db_session.add(
        OcrResult(
            task_id=task.id,
            page_no=1,
            blocks=[
                {"text": "Diagnosis: URI", "bbox": [5, 5, 50, 15], "confidence": 0.91}
            ],
        )
    )
    db_session.add(
        ExtractionResult(
            task_id=task.id,
            fields={
                "diagnosis_text": {
                    "value": "URI",
                    "status": "extracted",
                    "confidence": 0.88,
                    "validation_error": None,
                }
            },
            model_name="mock",
            stage="final",
            stub=True,
        )
    )
    db_session.add(
        ExtractionMappedResult(
            task_id=task.id,
            insurance_company="AIA",
            mapping_source="fallback",
            fields={
                "diagnosis_desc": {
                    "value": "URI",
                    "status": "extracted",
                    "confidence": 0.88,
                    "validation_error": None,
                    "source_field": "diagnosis_text",
                }
            },
            unmapped_fields=[],
        )
    )
    await db_session.commit()

    prepared = await run_prepare_review(
        db_session, task_no=task_no, clinic_id=clinic.id
    )
    assert prepared.review.standard_fields["diagnosis_text"].page == 1
    # doctor_name 由 AI 从文档提取，示例数据未提供 -> missing，不再取登录医生
    assert prepared.review.standard_fields["doctor_name"].status == "missing"
    assert prepared.review.standard_fields["doctor_name"].value is None
    assert prepared.review.standard_fields["receipt_no"].status == "missing"
    assert prepared.review.mapped_fields is not None

    saved = await save_review_output(
        db_session,
        task_no=task_no,
        clinic_id=clinic.id,
        doctor_id=doctor.id,
        data=Step11SaveReviewInput(
            fields={"diagnosis_text": ReviewFieldEditIn(value="Upper respiratory infection")}
        ),
    )
    assert (
        saved.review.display_fields["diagnosis_text"].value
        == "Upper respiratory infection"
    )

    confirmed = await confirm_review(
        db_session,
        task_no=task_no,
        clinic_id=clinic.id,
        doctor_id=doctor.id,
    )
    assert confirmed.status == "COMPLETED"
    assert confirmed.review.is_confirmed is True

    fetched = await get_review_output(
        db_session, task_no=task_no, clinic_id=clinic.id
    )
    assert fetched.is_confirmed is True

    row = (
        await db_session.execute(
            select(ExtractionReviewOutput).where(ExtractionReviewOutput.task_id == task.id)
        )
    ).scalar_one()
    assert row.reviewed_by_id == doctor.id
