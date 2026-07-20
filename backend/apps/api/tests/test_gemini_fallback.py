"""Gemini 本地降级单测。"""
import pytest

from src.core.exceptions import AiServiceUnavailableError
from src.modules.pdf_extraction.ai_service.gemini_classifier import GeminiDocumentClassifier


class FailingGeminiClient:
    enabled = True

    async def generate_structured_json(self, **kwargs):
        raise AiServiceUnavailableError("AI 服务配额已用尽或限流（429）")


@pytest.mark.asyncio
async def test_classifier_falls_back_to_stub_on_ai_error_in_local(monkeypatch):
    monkeypatch.setenv("APP_ENV", "local")
    from src.config import get_settings

    get_settings.cache_clear()

    classifier = GeminiDocumentClassifier(client=FailingGeminiClient())  # type: ignore[arg-type]
    result = await classifier.classify("Patient Name: Chan Tai Man")
    assert result.stub is True
    assert result.classification.document_type == "Unknown"
    assert ":stub" in result.model_name

    get_settings.cache_clear()
