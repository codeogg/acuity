"""Step7 字段提取 AI 服务抽象（Gemini Pro，可替换）。"""
from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel, Field

from src.modules.pdf_extraction.extractable_field import ExtractableField

FieldExtractionStatus = Literal[
    "extracted",
    "missing",
    "low_confidence",
    "ambiguous",
    "conflict_between_models",
    "conflict",
]


class ExtractedFieldValue(BaseModel):
    value: str | None = None
    status: FieldExtractionStatus
    confidence: float = Field(ge=0.0, le=1.0)


class FieldExtractionInvokeResult(BaseModel):
    fields: dict[str, ExtractedFieldValue]
    model_name: str
    token_usage: int = 0
    stub: bool = False


class IFieldExtractor(Protocol):
    async def extract_fields(
        self, prompt_text: str, fields: list[ExtractableField]
    ) -> FieldExtractionInvokeResult: ...


_extractor: IFieldExtractor | None = None


def get_field_extractor() -> IFieldExtractor:
    global _extractor
    if _extractor is None:
        from src.modules.pdf_extraction.ai_service.gemini_field_extractor import (
            GeminiFieldExtractor,
        )

        _extractor = GeminiFieldExtractor()
    return _extractor


def set_field_extractor(extractor: IFieldExtractor | None) -> None:
    global _extractor
    _extractor = extractor
