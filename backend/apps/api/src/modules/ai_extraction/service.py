"""AI 病历识别服务。"""
import time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.ai_usage_context import reset_ai_call_context, set_ai_call_context
from src.core.logging import get_logger
from src.db.models import StandardField, TemplateField, TemplateFieldMapping
from src.modules.ai_extraction.gemini_client import get_gemini_client
from src.modules.ai_extraction.prompt_builder import build_extraction_prompt
from src.modules.ai_extraction.schemas import ExtractedField, ExtractResponse
from src.utils.rate_limit import check_ai_rate_limit

logger = get_logger(__name__)


async def get_required_fields_by_template(
    db: AsyncSession, template_id: int
) -> list[StandardField]:
    """通过 template_field_mapping 反查该模板需要 AI 提取的标准字段（source_type=AI）。"""
    stmt = (
        select(StandardField)
        .join(
            TemplateFieldMapping,
            TemplateFieldMapping.standard_field_id == StandardField.id,
        )
        .join(TemplateField, TemplateField.id == TemplateFieldMapping.template_field_id)
        .where(
            TemplateField.template_id == template_id,
            StandardField.source_type == "AI",
        )
        .distinct()
    )
    return list((await db.execute(stmt)).scalars().all())


async def extract(
    db: AsyncSession,
    *,
    text: str,
    template_id: int,
    clinic_id: int,
    doctor_id: int,
) -> ExtractResponse:
    await check_ai_rate_limit(clinic_id)

    required_fields = await get_required_fields_by_template(db, template_id)
    if not required_fields:
        return ExtractResponse(extracted_fields={}, process_time_ms=0, token_usage=0)

    prompt, schema = build_extraction_prompt(text, required_fields)
    start = time.perf_counter()
    usage_token = set_ai_call_context(
        purpose="extract_fields",
        clinic_id=clinic_id,
        doctor_id=doctor_id,
    )
    try:
        result = await get_gemini_client().extract_structured(prompt, schema)
    finally:
        reset_ai_call_context(usage_token)
    elapsed_ms = int((time.perf_counter() - start) * 1000)

    parsed: dict = result.get("parsed") or {}
    extracted: dict[str, ExtractedField] = {}
    for f in required_fields:
        item = parsed.get(f.field_code) or {}
        extracted[f.field_code] = ExtractedField(
            value=item.get("value"),
            confidence=float(item.get("confidence", 0.0)),
        )

    return ExtractResponse(
        extracted_fields=extracted,
        process_time_ms=elapsed_ms,
        token_usage=int(result.get("token_usage", 0)),
    )
