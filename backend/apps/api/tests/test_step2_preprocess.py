"""Step2 PDF 预处理单测。"""
import fitz
import pytest

from src.modules.pdf_extraction.schemas import Step2PreprocessInput
from src.modules.pdf_extraction.steps.step2_preprocess import (
    build_step2_output,
    has_substantial_text,
    preprocess_pdf_bytes,
)


def _pdf_with_text(text: str) -> bytes:
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    data = doc.tobytes()
    doc.close()
    return data


def _blank_pdf() -> bytes:
    doc = fitz.open()
    doc.new_page()
    data = doc.tobytes()
    doc.close()
    return data


def test_has_substantial_text():
    assert has_substantial_text("Patient Name: Chan Tai Man")
    assert not has_substantial_text("   \n\t  ")
    assert not has_substantial_text("short")


def test_preprocess_text_layer_page():
    pdf_bytes = _pdf_with_text("Patient Name: Chan Tai Man\nDiagnosis: URI")
    data = Step2PreprocessInput(
        task_id="EXTTEST001", clinic_id=1, pdf_url="/local-storage/test.pdf"
    )
    pages = preprocess_pdf_bytes(pdf_bytes, data)
    assert len(pages) == 1
    assert pages[0].source == "text_layer"
    assert pages[0].text is not None
    assert "Chan Tai Man" in pages[0].text
    assert pages[0].image_path is None


def test_preprocess_blank_page_requires_ocr():
    pdf_bytes = _blank_pdf()
    data = Step2PreprocessInput(
        task_id="EXTTEST002", clinic_id=1, pdf_url="/local-storage/test.pdf"
    )
    pages = preprocess_pdf_bytes(pdf_bytes, data)
    assert len(pages) == 1
    assert pages[0].source == "ocr_required"
    assert pages[0].text is None
    assert pages[0].image_path is not None
    assert pages[0].image_path.startswith("/local-storage/")


def test_build_step2_output_summary():
    data = Step2PreprocessInput(
        task_id="EXTTEST003", clinic_id=1, pdf_url="/local-storage/test.pdf"
    )
    pdf_bytes = _pdf_with_text("A" * 30)
    pages = preprocess_pdf_bytes(pdf_bytes, data)
    output = build_step2_output(data, pages)
    assert output.status == "OCR"
    assert output.page_count == 1
    assert output.text_layer_count == 1
    assert output.ocr_required_count == 0
