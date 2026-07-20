"""AI 辅助字段识别异步任务（二期核心，MVP 下为占位实现）。

逻辑：对低置信度字段所在页渲染为图片，调用 Gemini 视觉识别，写回 recognize_source=AI_VISION。
本地无 GCP 凭证时 GeminiClient 处于 stub 模式，任务会安全跳过。
"""
import json
from typing import Any

from sqlalchemy import select

from src.core.ai_usage_context import reset_ai_call_context, set_ai_call_context
from src.core.logging import get_logger
from src.db.models import PolicyTemplate, StandardField, TemplateField
from src.db.session import async_session_factory
from src.modules.ai_extraction.gemini_client import get_gemini_client
from src.modules.templates.pdf_parser import render_page_png
from src.utils import storage

logger = get_logger(__name__)

AI_ASSIST_CONFIDENCE_THRESHOLD = 70.0


def _build_hint(standard_fields: list[StandardField]) -> str:
    field_list = "\n".join(f"- {f.field_code}: {f.field_name}" for f in standard_fields)
    return (
        "你是保单表单版面分析助手。请识别图片中所有需要填写的字段，"
        "返回 JSON 数组，每项包含 label, field_type(text/checkbox/date/signature/image), "
        "以及可选的 suggested_standard_field_code。可参考的标准字段：\n" + field_list
    )


async def ai_assist_recognize_task(ctx: Any, template_id: int) -> None:
    client = get_gemini_client()
    if not client.enabled:
        logger.info("ai_assist_skipped_stub", template_id=template_id)
        return

    async with async_session_factory() as db:
        template = await db.get(PolicyTemplate, template_id)
        if not template:
            return
        standard_fields = list((await db.execute(select(StandardField))).scalars().all())
        low_conf_pages = {
            f.page_no
            for f in (
                await db.execute(
                    select(TemplateField).where(
                        TemplateField.template_id == template_id,
                        TemplateField.confidence_score < AI_ASSIST_CONFIDENCE_THRESHOLD,
                    )
                )
            ).scalars()
        }
        if not low_conf_pages:
            low_conf_pages = {1}

        try:
            pdf_bytes = storage.download_bytes(template.original_pdf_url)
            hint = _build_hint(standard_fields)
            for page_no in sorted(low_conf_pages):
                image = render_page_png(pdf_bytes, page_no)
                usage_token = set_ai_call_context(
                    purpose="suggest_extraction_hint",
                    admin_user_id=template.created_by,
                )
                try:
                    result = await client.analyze_pdf_page_image(image, hint)
                finally:
                    reset_ai_call_context(usage_token)
                logger.info(
                    "ai_assist_page_done",
                    template_id=template_id,
                    page_no=page_no,
                    result=json.dumps(result)[:500],
                )
                # 生产实现：把 result 中的候选字段坐标换算后 upsert 到 template_field
            template.parse_status = "AI_ASSISTED"
            await db.commit()
        except Exception as exc:
            logger.error("ai_assist_failed", template_id=template_id, error=str(exc))
