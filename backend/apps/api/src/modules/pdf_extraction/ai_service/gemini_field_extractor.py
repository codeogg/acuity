"""Gemini Pro 字段提取实现。"""
from __future__ import annotations

from src.config import settings
from src.modules.ai_extraction.gemini_client import (
    GeminiClient,
    _LONG_TIMEOUT_S,
    get_gemini_client,
)
from src.modules.pdf_extraction.ai_service.field_extractor import (
    ExtractedFieldValue,
    FieldExtractionInvokeResult,
    IFieldExtractor,
)
from src.modules.pdf_extraction.ai_service.fallback import call_or_stub
from src.modules.pdf_extraction.ai_service.prompts import (
    build_field_extraction_prompt,
    field_extraction_response_schema,
)
from src.modules.pdf_extraction.extractable_field import ExtractableField


def build_response_schema(fields: list[ExtractableField]) -> dict:
    return field_extraction_response_schema(fields)


def normalize_extracted_fields(
    parsed: dict,
    fields: list[ExtractableField],
) -> dict[str, ExtractedFieldValue]:
    normalized: dict[str, ExtractedFieldValue] = {}
    for field in fields:
        item = parsed.get(field.field_code) or {}
        value = item.get("value")
        if value is not None:
            value = str(value).strip() or None
        status = item.get("status") or "missing"
        if status not in ("extracted", "missing", "low_confidence"):
            status = "missing"
        if value is None and status == "extracted":
            status = "missing"
        if value is None:
            status = "missing"
        confidence = float(item.get("confidence") or 0.0)
        normalized[field.field_code] = ExtractedFieldValue(
            value=value,
            status=status,  # type: ignore[arg-type]
            confidence=confidence,
        )
    return normalized


def stub_extracted_fields(fields: list[ExtractableField]) -> dict[str, ExtractedFieldValue]:
    return {
        field.field_code: ExtractedFieldValue(
            value=None, status="missing", confidence=0.0
        )
        for field in fields
    }


class GeminiFieldExtractor(IFieldExtractor):
    def __init__(self, client: GeminiClient | None = None) -> None:
        self._client = client or get_gemini_client(settings.gemini_extractor_location)

    async def extract_fields(
        self, prompt_text: str, fields: list[ExtractableField]
    ) -> FieldExtractionInvokeResult:
        model_name = settings.GEMINI_EXTRACTOR_MODEL
        if not fields:
            return FieldExtractionInvokeResult(
                fields={},
                model_name=f"{model_name}:stub",
                token_usage=0,
                stub=True,
            )

        if not self._client.enabled:
            return FieldExtractionInvokeResult(
                fields=stub_extracted_fields(fields),
                model_name=f"{model_name}:stub",
                token_usage=0,
                stub=True,
            )

        async def _invoke() -> FieldExtractionInvokeResult:
            prompt = build_field_extraction_prompt(prompt_text)
            schema = build_response_schema(fields)
            raw = await self._client.generate_structured_json(
                prompt=prompt,
                response_schema=schema,
                model=model_name,
                temperature=0.0,
                timeout_s=_LONG_TIMEOUT_S,
                thinking_level=settings.GEMINI_EXTRACTOR_THINKING_LEVEL,
                usage_context="step7_extract_fields",
            )
            parsed = raw.get("parsed") or {}
            return FieldExtractionInvokeResult(
                fields=normalize_extracted_fields(parsed, fields),
                model_name=model_name,
                token_usage=int(raw.get("token_usage") or 0),
                stub=False,
            )

        def _stub() -> FieldExtractionInvokeResult:
            return FieldExtractionInvokeResult(
                fields=stub_extracted_fields(fields),
                model_name=f"{model_name}:stub",
                token_usage=0,
                stub=True,
            )

        return await call_or_stub(
            "step7_extract_fields",
            model=model_name,
            call=_invoke,
            stub=_stub,
        )
