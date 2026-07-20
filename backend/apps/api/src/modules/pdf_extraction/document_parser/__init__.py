"""文档解析抽象：MinerU（PDF→Markdown）或 PaddleOCR 逐页 OCR。"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Protocol

from src.config import settings

DocumentParserKind = Literal["paddle", "mineru"]


@dataclass(frozen=True)
class ParsedPageText:
    page_no: int
    text: str
    markdown: str | None = None


@dataclass(frozen=True)
class DocumentParseResult:
    markdown: str
    pages: list[ParsedPageText]
    engine: DocumentParserKind


class IDocumentParser(Protocol):
    async def parse_pdf(self, pdf_bytes: bytes, *, task_id: str) -> DocumentParseResult: ...


def get_document_parser_kind() -> DocumentParserKind:
    kind = (settings.DOCUMENT_PARSER or "paddle").strip().lower()
    if kind not in ("paddle", "mineru"):
        return "paddle"
    return kind  # type: ignore[return-value]


def uses_mineru() -> bool:
    return get_document_parser_kind() == "mineru"
