"""Step6 Prompt Builder 单测。"""
from types import SimpleNamespace

from src.modules.pdf_extraction.steps.step6_prompt_builder import (
    SelectedVisitContext,
    assemble_visit_scoped_extraction_text,
    build_extraction_prompt_text,
    filter_pages_for_visit,
    partition_pages_for_visit_extraction,
)
from src.modules.pdf_extraction.schemas import OcrBlockOut, Step3PageOcrOutput


def _field(code: str, name: str, hint: str) -> SimpleNamespace:
    return SimpleNamespace(
        field_code=code,
        field_name=name,
        data_type="text",
        ai_extraction_hint=hint,
        enum_options=None,
    )


def _page(n: int, text: str) -> Step3PageOcrOutput:
    return Step3PageOcrOutput(
        task_id="T1",
        page=n,
        blocks=[OcrBlockOut(text=text, confidence=0.9, bbox=[0, 0, 1, 1])],
    )


def test_filter_pages_for_visit():
    pages = [
        Step3PageOcrOutput(task_id="T1", page=i, blocks=[])
        for i in range(1, 6)
    ]
    filtered = filter_pages_for_visit(pages, page_start=2, page_end=4)
    assert [page.page for page in filtered] == [2, 3, 4]


def test_partition_pages_for_visit_extraction_includes_context():
    pages = [_page(1, "Patient: CHAN"), _page(2, "Visit1"), _page(3, "Visit2 diag")]
    context, visit = partition_pages_for_visit_extraction(
        pages, page_start=3, page_end=3
    )
    assert [p.page for p in context] == [1, 2]
    assert [p.page for p in visit] == [3]


def test_assemble_visit_scoped_extraction_text_includes_both_sections():
    pages = [_page(1, "Patient: CHAN"), _page(3, "Diagnosis: URI")]
    context, visit = partition_pages_for_visit_extraction(
        pages, page_start=3, page_end=3
    )
    text, pages_used, _ = assemble_visit_scoped_extraction_text(context, visit)
    assert "Shared Document Context" in text
    assert "Selected Visit Content" in text
    assert "Patient: CHAN" in text
    assert "Diagnosis: URI" in text
    assert pages_used == 2


def test_build_extraction_prompt_text_includes_sections():
    prompt = build_extraction_prompt_text(
        document_type="Hospital_Discharge",
        language="zh-en",
        insurance_company="AIA",
        ocr_content="Diagnosis: URI",
        fields=[_field("diagnosis_text", "诊断结果", "主要诊断")],
        selected_visit=SelectedVisitContext(
            visit_index=2,
            visit_date="2025-03-01",
            summary="Gallstone",
            page_start=3,
            page_end=4,
        ),
        uploaded_patient_name="陳大文",
    )
    assert "# Document Type" in prompt
    assert "Hospital_Discharge" in prompt
    assert "Visit2" in prompt
    assert "Diagnosis: URI" in prompt
    assert "diagnosis_text" in prompt
    assert "Consultation fee" in prompt
    assert "amount_total" in prompt
    assert "Multi-Visit Field Binding" in prompt
    assert "patient_name_cn" in prompt
    assert "陳大文" in prompt
