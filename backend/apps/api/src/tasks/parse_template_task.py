"""模板自动解析异步任务。"""
from typing import Any

from sqlalchemy import delete

from src.core.logging import get_logger
from src.db.models import PolicyTemplate, TemplateField
from src.db.session import async_session_factory
from src.modules.templates.pdf_parser import parse_pdf_template
from src.tasks.parse_progress import report_progress, report_progress_sync
from src.utils import storage

logger = get_logger(__name__)

AI_ASSIST_CONFIDENCE_THRESHOLD = 70.0

# 不可重试：PDF 损坏/格式错误等，重试无意义
NON_RETRYABLE_KEYWORDS = ("损坏", "corrupt", "invalid pdf", "not a pdf", "encrypted")


def _is_retryable(exc: Exception) -> bool:
    msg = str(exc).lower()
    return not any(k in msg for k in NON_RETRYABLE_KEYWORDS)


async def _set_parse_state(
    template: PolicyTemplate,
    *,
    status: str,
    progress: int,
    message: str | None = None,
    error: str | None = None,
) -> None:
    template.parse_status = status
    template.parse_progress = progress
    template.parse_message = message
    if error is not None:
        template.parse_error = error


async def parse_template_task(ctx: Any, template_id: int) -> None:
    async with async_session_factory() as db:
        template = await db.get(PolicyTemplate, template_id)
        if not template:
            logger.error("parse_template_missing", template_id=template_id)
            return

        try:
            await _set_parse_state(
                template, status="PARSING", progress=5, message="正在加载 PDF 文件"
            )
            await db.commit()
            await report_progress(template_id, 5, "正在加载 PDF 文件")

            pdf_bytes = storage.download_bytes(template.original_pdf_url)

            def on_progress(percent: int, message: str) -> None:
                report_progress_sync(template_id, percent, message)

            result = parse_pdf_template(pdf_bytes, on_progress=on_progress)

            await report_progress(template_id, 80, "正在写入字段数据")
            template.parse_message = "正在写入字段数据"
            template.parse_progress = 80
            await db.commit()

            # 重新解析时清空旧字段
            await db.execute(
                delete(TemplateField).where(TemplateField.template_id == template_id)
            )

            for pf in result.fields:
                db.add(
                    TemplateField(
                        template_id=template_id,
                        page_no=pf.page_no,
                        field_label_raw=pf.field_label_raw,
                        pdf_field_name=pf.pdf_field_name,
                        field_type=pf.field_type,
                        pos_x=pf.pos_x,
                        pos_y=pf.pos_y,
                        width=pf.width,
                        height=pf.height,
                        recognize_source=pf.recognize_source,
                        confidence_score=pf.confidence_score,
                    )
                )
            template.page_count = result.page_count
            template.page_width = result.page_width
            template.page_height = result.page_height
            await _set_parse_state(
                template,
                status="AUTO_PARSED",
                progress=100,
                message="解析完成",
                error=None,
            )
            await db.commit()
            await report_progress(template_id, 100, "解析完成")
            logger.info(
                "parse_template_done",
                template_id=template_id,
                field_count=len(result.fields),
                has_acroform=result.has_acroform,
            )

            needs_ai = (not result.has_acroform) or any(
                (pf.confidence_score or 0) < AI_ASSIST_CONFIDENCE_THRESHOLD
                for pf in result.fields
            )
            if needs_ai:
                from src.tasks.queue import enqueue_ai_assist

                await enqueue_ai_assist(template_id)
        except Exception as exc:
            logger.error("parse_template_failed", template_id=template_id, error=str(exc))
            err_msg = str(exc)[:255]
            await _set_parse_state(
                template,
                status="PARSE_FAILED",
                progress=0,
                message=f"解析失败：{err_msg}",
                error=str(exc)[:2000],
            )
            await db.commit()
            await report_progress(template_id, 0, f"解析失败：{err_msg}")
            if _is_retryable(exc):
                raise  # arq 可配置自动重试
            # 不可重试错误吞掉，避免无意义重试
