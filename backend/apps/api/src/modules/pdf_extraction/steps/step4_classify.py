"""Step4：文档分类前的本地文本拼装（无 AI）。"""
from __future__ import annotations

from src.modules.pdf_extraction.schemas import OcrBlockOut, Step3PageOcrOutput

MAX_CLASSIFY_PAGES = 5
MAX_CLASSIFY_CHARS = 12_000


def page_text_from_blocks(blocks: list[OcrBlockOut]) -> str:
    return "\n".join(block.text.strip() for block in blocks if block.text.strip())


def assemble_document_text(
    pages: list[Step3PageOcrOutput],
    *,
    max_pages: int = MAX_CLASSIFY_PAGES,
    max_chars: int = MAX_CLASSIFY_CHARS,
) -> tuple[str, int, int]:
    """从 Step3 blocks 拼装分类用文本，返回 (text, pages_used, char_count)。"""
    sorted_pages = sorted(pages, key=lambda p: p.page)
    selected = sorted_pages[:max_pages]

    parts: list[str] = []
    total_chars = 0
    pages_used = 0

    for page in selected:
        page_text = page_text_from_blocks(page.blocks)
        if not page_text:
            continue
        chunk = f"--- Page {page.page} ---\n{page_text}"
        if total_chars + len(chunk) > max_chars:
            remaining = max_chars - total_chars
            if remaining <= 0:
                break
            chunk = chunk[:remaining]
        parts.append(chunk)
        total_chars += len(chunk)
        pages_used += 1
        if total_chars >= max_chars:
            break

    return "\n\n".join(parts), pages_used, total_chars
