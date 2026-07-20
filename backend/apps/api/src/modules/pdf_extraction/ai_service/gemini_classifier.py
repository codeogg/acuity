"""Gemini 2.5 Flash 文档分类实现。"""
from __future__ import annotations

from src.config import settings
from src.modules.ai_extraction.gemini_client import (
    GeminiClient,
    _LONG_TIMEOUT_S,
    get_gemini_client,
)
from src.modules.pdf_extraction.ai_service import (
    ClassificationInvokeResult,
    DocumentClassificationResult,
    IDocumentClassifier,
)
from src.modules.pdf_extraction.ai_service.fallback import call_or_stub
from src.modules.pdf_extraction.ai_service.prompts import (
    CLASSIFICATION_RESPONSE_SCHEMA,
    build_classification_prompt,
)

_STUB_CLASSIFICATION = DocumentClassificationResult(
    document_type="Unknown",
    language="zh-en",
    multiple_patient=False,
    multiple_visit=False,
    insurance_company=None,
    need_visit_selector=False,
)


def normalize_classification(
    result: DocumentClassificationResult,
) -> DocumentClassificationResult:
    if result.multiple_visit and not result.need_visit_selector:
        return result.model_copy(update={"need_visit_selector": True})
    return result


class GeminiDocumentClassifier(IDocumentClassifier):
    def __init__(self, client: GeminiClient | None = None) -> None:
        self._client = client or get_gemini_client(settings.gemini_classifier_location)

    async def classify(self, document_text: str) -> ClassificationInvokeResult:
        model_name = settings.GEMINI_CLASSIFIER_MODEL
        if not self._client.enabled:
            return ClassificationInvokeResult(
                classification=_STUB_CLASSIFICATION,
                model_name=f"{model_name}:stub",
                token_usage=0,
                stub=True,
            )

        async def _invoke() -> ClassificationInvokeResult:
            prompt = build_classification_prompt(document_text)
            raw = await self._client.generate_structured_json(
                prompt=prompt,
                response_schema=CLASSIFICATION_RESPONSE_SCHEMA,
                model=model_name,
                temperature=0.0,
                timeout_s=_LONG_TIMEOUT_S,
                usage_context="step4_classify",
            )
            parsed = raw.get("parsed") or {}
            classification = normalize_classification(
                DocumentClassificationResult.model_validate(parsed)
            )
            return ClassificationInvokeResult(
                classification=classification,
                model_name=model_name,
                token_usage=int(raw.get("token_usage") or 0),
                stub=False,
            )

        def _stub() -> ClassificationInvokeResult:
            return ClassificationInvokeResult(
                classification=_STUB_CLASSIFICATION,
                model_name=f"{model_name}:stub",
                token_usage=0,
                stub=True,
            )

        return await call_or_stub(
            "step4_classify",
            model=model_name,
            call=_invoke,
            stub=_stub,
        )
