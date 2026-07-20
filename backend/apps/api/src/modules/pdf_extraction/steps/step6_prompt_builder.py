"""Step6：Prompt Builder（本地拼装，无 AI）。"""
from __future__ import annotations

from dataclasses import dataclass

from src.modules.pdf_extraction.document_parser import uses_mineru
from src.modules.pdf_extraction.extractable_field import ExtractableField
from src.modules.pdf_extraction.ai_service.prompts import EXTRACTION_FIELD_MAPPING_RULES
from src.modules.pdf_extraction.schemas import Step3PageOcrOutput
from src.modules.pdf_extraction.steps.step4_classify import assemble_document_text

MAX_EXTRACT_PAGES = 30
MAX_EXTRACT_CHARS = 48_000

# 多就诊时，病人身份信息常出现在就诊分段之前的共享页
PATIENT_IDENTITY_FIELD_CODES = frozenset({
    "patient_name_cn",
    "patient_name_en",
    "dob",
    "gender",
    "hkid",
    "patient_phone",
})


@dataclass(frozen=True)
class SelectedVisitContext:
    visit_index: int
    visit_date: str | None
    summary: str | None
    page_start: int
    page_end: int


def filter_pages_for_visit(
    pages: list[Step3PageOcrOutput],
    *,
    page_start: int | None = None,
    page_end: int | None = None,
) -> list[Step3PageOcrOutput]:
    if page_start is None or page_end is None:
        return sorted(pages, key=lambda page: page.page)
    return sorted(
        [page for page in pages if page_start <= page.page <= page_end],
        key=lambda page: page.page,
    )


def partition_pages_for_visit_extraction(
    pages: list[Step3PageOcrOutput],
    *,
    page_start: int,
    page_end: int,
) -> tuple[list[Step3PageOcrOutput], list[Step3PageOcrOutput]]:
    """拆分共享文档页（就诊前）与所选就诊页。病人信息常在共享页。"""
    sorted_pages = sorted(pages, key=lambda page: page.page)
    visit_pages = [page for page in sorted_pages if page_start <= page.page <= page_end]
    context_pages = [page for page in sorted_pages if page.page < page_start]
    return context_pages, visit_pages


def assemble_extraction_text(
    pages: list[Step3PageOcrOutput],
    *,
    max_pages: int = MAX_EXTRACT_PAGES,
    max_chars: int = MAX_EXTRACT_CHARS,
) -> tuple[str, int, int]:
    return assemble_document_text(pages, max_pages=max_pages, max_chars=max_chars)


def assemble_visit_scoped_extraction_text(
    context_pages: list[Step3PageOcrOutput],
    visit_pages: list[Step3PageOcrOutput],
    *,
    max_pages: int = MAX_EXTRACT_PAGES,
    max_chars: int = MAX_EXTRACT_CHARS,
) -> tuple[str, int, int]:
    """优先保留就诊页，剩余配额给共享上下文页。"""
    visit_text, visit_pages_used, visit_chars = assemble_extraction_text(
        visit_pages,
        max_pages=max_pages,
        max_chars=max_chars,
    )
    if not context_pages:
        return visit_text, visit_pages_used, visit_chars

    remaining_pages = max(0, max_pages - visit_pages_used)
    remaining_chars = max(0, max_chars - visit_chars)
    if remaining_pages <= 0 or remaining_chars <= 0:
        return visit_text, visit_pages_used, visit_chars

    context_text, context_pages_used, _ = assemble_extraction_text(
        context_pages,
        max_pages=remaining_pages,
        max_chars=remaining_chars,
    )
    if not context_text.strip():
        return visit_text, visit_pages_used, visit_chars

    combined = (
        "# Shared Document Context (pages before selected visit)\n"
        f"{context_text}\n\n"
        "# Selected Visit Content\n"
        f"{visit_text}"
    )
    return combined, visit_pages_used + context_pages_used, len(combined)


def _format_visit_section(visit: SelectedVisitContext | None) -> str:
    if not visit:
        return "N/A (single visit document)"
    date_part = visit.visit_date or "unknown date"
    summary_part = visit.summary or "no summary"
    return (
        f"Visit{visit.visit_index} ({date_part}, {summary_part}) "
        f"[pages {visit.page_start}-{visit.page_end}]"
    )


def _format_target_schema(fields: list[ExtractableField]) -> str:
    lines: list[str] = []
    for field in fields:
        hint = field.ai_extraction_hint or "extract from document text"
        enum_hint = ""
        if field.enum_options:
            enum_hint = f"; allowed values: {', '.join(field.enum_options)}"
        lines.append(
            f"- {field.field_code} ({field.field_name}, {field.data_type}): {hint}{enum_hint}"
        )
    return "\n".join(lines)


def _multi_visit_field_rules() -> str:
    patient_fields = ", ".join(sorted(PATIENT_IDENTITY_FIELD_CODES))
    return f"""# Multi-Visit Field Binding
- Selected visit pages are authoritative for diagnosis, procedure, dates, fees, and other visit-specific fields.
- Patient identity fields ({patient_fields}) may appear in Shared Document Context pages before the selected visit; extract them from there if absent in visit pages.
- If multiple patients appear in the document, bind all fields to the claim target patient (e.g. 索償對象 / insured / member), never a bystander patient.
- Do not import clinical facts from other visits outside the selected visit pages."""


def build_extraction_prompt_text(
    *,
    document_type: str,
    language: str,
    insurance_company: str | None,
    ocr_content: str,
    fields: list[ExtractableField],
    selected_visit: SelectedVisitContext | None = None,
    uploaded_patient_name: str | None = None,
    template_specific_fields: list[ExtractableField] | None = None,
) -> str:
    insurer_line = insurance_company or "unknown"
    upload_hint = ""
    if uploaded_patient_name and uploaded_patient_name.strip():
        upload_hint = (
            f"\n# Upload Hint (reference only, do not fabricate)\n"
            f"Expected patient name from upload form: {uploaded_patient_name.strip()}\n"
        )
    multi_visit_rules = (
        f"\n{_multi_visit_field_rules()}\n" if selected_visit is not None else ""
    )
    content_heading = (
        "# Document Content (Markdown)"
        if uses_mineru()
        else "# OCR Content"
    )
    template_section = ""
    if template_specific_fields:
        template_section = (
            "\n\n# Template-Specific AI Fields\n"
            "These fields are mapped by the selected claim form template. "
            "Extract each using its hint. If the document has no evidence, "
            "mark status=missing and value=null — do not invent values.\n"
            f"{_format_target_schema(template_specific_fields)}"
        )
    return f"""# Document Type
{document_type}

# Language
{language}

# Insurance Company
{insurer_line}

# Visit Selected
{_format_visit_section(selected_visit)}
{upload_hint}{multi_visit_rules}
{content_heading}
{ocr_content}

# Target Schema
{_format_target_schema(fields)}
{template_section}

{EXTRACTION_FIELD_MAPPING_RULES}"""
