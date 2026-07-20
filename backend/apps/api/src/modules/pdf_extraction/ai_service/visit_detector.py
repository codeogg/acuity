"""Step5 多就诊检测 AI 服务抽象（Gemini 2.5 Flash，可替换）。"""
from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, Field

from src.modules.pdf_extraction.ai_service import DocumentClassificationResult


class VisitCandidateResult(BaseModel):
    visit_index: int = Field(ge=1)
    visit_date: str | None = None
    summary: str | None = None
    page_range: list[int] = Field(min_length=2, max_length=2)


class VisitDetectionInvokeResult(BaseModel):
    visits: list[VisitCandidateResult]
    model_name: str
    token_usage: int = 0
    stub: bool = False


class IVisitDetector(Protocol):
    async def detect_visits(
        self,
        document_text: str,
        classification: DocumentClassificationResult,
        *,
        total_pages: int,
    ) -> VisitDetectionInvokeResult: ...


_detector: IVisitDetector | None = None


def get_visit_detector() -> IVisitDetector:
    global _detector
    if _detector is None:
        from src.modules.pdf_extraction.ai_service.gemini_visit_detector import (
            GeminiVisitDetector,
        )

        _detector = GeminiVisitDetector()
    return _detector


def set_visit_detector(detector: IVisitDetector | None) -> None:
    global _detector
    _detector = detector
