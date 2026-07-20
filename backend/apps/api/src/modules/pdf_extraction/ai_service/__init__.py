"""Step4 文档分类 AI 服务抽象（Gemini 2.5 Flash，可替换）。"""
from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel, Field


class DocumentClassificationResult(BaseModel):
    document_type: str
    language: str
    multiple_patient: bool
    multiple_visit: bool
    insurance_company: str | None = None
    need_visit_selector: bool


class ClassificationInvokeResult(BaseModel):
    classification: DocumentClassificationResult
    model_name: str
    token_usage: int = 0
    stub: bool = False


class IDocumentClassifier(Protocol):
    async def classify(self, document_text: str) -> ClassificationInvokeResult: ...


_classifier: IDocumentClassifier | None = None


def get_document_classifier() -> IDocumentClassifier:
    global _classifier
    if _classifier is None:
        from src.modules.pdf_extraction.ai_service.gemini_classifier import (
            GeminiDocumentClassifier,
        )

        _classifier = GeminiDocumentClassifier()
    return _classifier


def set_document_classifier(classifier: IDocumentClassifier | None) -> None:
    global _classifier
    _classifier = classifier
