"""MinerU Markdown / content_list.json → Step3 OCR blocks 适配。"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

from src.modules.pdf_extraction.document_parser import ParsedPageText
from src.modules.pdf_extraction.schemas import OcrBlockOut, Step3PageOcrOutput


def _block_text_from_content_item(item: dict[str, Any]) -> str:
    block_type = str(item.get("type") or "")
    if block_type == "text":
        return str(item.get("text") or "").strip()
    if block_type == "list":
        parts = item.get("list_items") or item.get("items") or []
        if isinstance(parts, list):
            return "\n".join(str(p).strip() for p in parts if str(p).strip())
        return str(item.get("text") or "").strip()
    if block_type == "table":
        return str(item.get("table_body") or item.get("text") or "").strip()
    if block_type == "code":
        return str(item.get("code_body") or item.get("text") or "").strip()
    if block_type == "equation":
        return str(item.get("text") or "").strip()
    if block_type == "image":
        caption = item.get("image_caption") or []
        content = item.get("content") or item.get("text") or ""
        cap = " ".join(str(c) for c in caption) if isinstance(caption, list) else str(caption)
        body = str(content).strip()
        if cap and body:
            return f"{cap}\n{body}"
        return cap or body
    return str(item.get("text") or "").strip()


def _skip_noise_block(item: dict[str, Any]) -> bool:
    block_type = str(item.get("type") or "")
    if block_type in ("header", "footer", "page_number", "aside_text"):
        return True
    sub = str(item.get("sub_type") or "")
    return sub in ("header", "footer", "page_number")


def pages_from_content_list(
    content_list: list[dict[str, Any]],
    *,
    page_count_hint: int,
) -> list[ParsedPageText]:
    by_page: dict[int, list[str]] = defaultdict(list)
    for item in content_list:
        if not isinstance(item, dict):
            continue
        if _skip_noise_block(item):
            continue
        text = _block_text_from_content_item(item)
        if not text:
            continue
        page_idx = item.get("page_idx")
        if page_idx is None:
            page_idx = 0
        by_page[int(page_idx)].append(text)

    if not by_page:
        return []

    max_idx = max(by_page)
    total_pages = max(page_count_hint, max_idx + 1)
    pages: list[ParsedPageText] = []
    for idx in range(total_pages):
        chunks = by_page.get(idx, [])
        body = "\n\n".join(chunks).strip()
        pages.append(
            ParsedPageText(
                page_no=idx + 1,
                text=body,
                markdown=body,
            )
        )
    return pages


def load_content_list_json(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if isinstance(data, dict):
        blocks = data.get("content_list") or data.get("blocks") or data.get("data")
        if isinstance(blocks, list):
            return [x for x in blocks if isinstance(x, dict)]
    return []


def find_content_list_file(output_dir: Path) -> Path | None:
    candidates = sorted(output_dir.rglob("*content_list.json"))
    if candidates:
        return candidates[0]
    return None


def find_markdown_file(output_dir: Path) -> Path | None:
    # MinerU 3.x 常见路径：{output}/{name}/auto/{name}.md
    md_files = sorted(output_dir.rglob("*.md"))
    if not md_files:
        return None
    auto_md = [p for p in md_files if "auto" in p.parts]
    return auto_md[0] if auto_md else md_files[0]


def split_markdown_by_page_markers(markdown: str, page_count_hint: int) -> list[ParsedPageText]:
    pattern = re.compile(r"<!--\s*page\s*(\d+)\s*-->", re.IGNORECASE)
    matches = list(pattern.finditer(markdown))
    if matches:
        pages: list[ParsedPageText] = []
        for i, match in enumerate(matches):
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(markdown)
            page_no = int(match.group(1))
            body = markdown[start:end].strip()
            pages.append(ParsedPageText(page_no=page_no, text=body, markdown=body))
        return sorted(pages, key=lambda p: p.page_no)

    if page_count_hint <= 1:
        body = markdown.strip()
        return [ParsedPageText(page_no=1, text=body, markdown=body)] if body else []

    lines = markdown.splitlines()
    chunk = max(1, len(lines) // page_count_hint)
    pages: list[ParsedPageText] = []
    for i in range(page_count_hint):
        start = i * chunk
        end = len(lines) if i == page_count_hint - 1 else (i + 1) * chunk
        body = "\n".join(lines[start:end]).strip()
        pages.append(ParsedPageText(page_no=i + 1, text=body, markdown=body))
    return pages


def markdown_to_step3_pages(
    *,
    task_id: str,
    pages: list[ParsedPageText],
) -> list[Step3PageOcrOutput]:
    outputs: list[Step3PageOcrOutput] = []
    for page in pages:
        text = (page.markdown or page.text or "").strip()
        if not text:
            outputs.append(
                Step3PageOcrOutput(task_id=task_id, page=page.page_no, blocks=[])
            )
            continue
        blocks = [
            OcrBlockOut(text=paragraph.strip(), bbox=None, confidence=1.0)
            for paragraph in re.split(r"\n{2,}", text)
            if paragraph.strip()
        ]
        if not blocks:
            blocks = [OcrBlockOut(text=text, bbox=None, confidence=1.0)]
        outputs.append(
            Step3PageOcrOutput(task_id=task_id, page=page.page_no, blocks=blocks)
        )
    return outputs
