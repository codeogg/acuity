"""Step5：多就诊检测前的本地文本拼装（无 AI）。"""
from __future__ import annotations

from src.modules.pdf_extraction.schemas import Step3PageOcrOutput
from src.modules.pdf_extraction.steps.step4_classify import assemble_document_text

MAX_DETECT_PAGES = 20
MAX_DETECT_CHARS = 24_000


def assemble_visit_detection_text(
    pages: list[Step3PageOcrOutput],
    *,
    max_pages: int = MAX_DETECT_PAGES,
    max_chars: int = MAX_DETECT_CHARS,
) -> tuple[str, int, int]:
    """从 Step3 blocks 拼装就诊检测用全文，返回 (text, pages_used, char_count)。"""
    return assemble_document_text(pages, max_pages=max_pages, max_chars=max_chars)
