"""AI 客户端横向用量拦截器。"""
from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from dataclasses import dataclass
from functools import wraps

from src.core.ai_usage_context import get_ai_call_context
from src.core.logging import get_logger

logger = get_logger(__name__)

@dataclass(frozen=True, slots=True)
class CapturedAiUsage:
    model: str
    purpose: str
    input_tokens: int
    output_tokens: int


_captured_usage: ContextVar[CapturedAiUsage | None] = ContextVar(
    "captured_ai_usage", default=None
)


def capture_ai_usage(
    *, model: str, purpose: str, input_tokens: int, output_tokens: int
) -> None:
    """由统一 usage_metadata 解析入口上报给当前拦截器。"""
    _captured_usage.set(
        CapturedAiUsage(
            model=model,
            purpose=purpose,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )
    )


async def _write_usage_log(
    *,
    captured: CapturedAiUsage | None,
    duration_ms: int,
    status: str,
    error_message: str | None,
    fallback_purpose: str,
    fallback_model: str,
) -> None:
    # 延迟导入，避免核心模块初始化时引入数据库模型。
    from src.db.models.ai_usage import AiUsageLog
    from src.db.session import async_session_factory

    context = get_ai_call_context()
    row = AiUsageLog(
        model=captured.model if captured else fallback_model,
        purpose=(
            context.purpose
            if context
            else (captured.purpose if captured else fallback_purpose)
        ),
        clinic_id=context.clinic_id if context else None,
        doctor_id=context.doctor_id if context else None,
        admin_user_id=context.admin_user_id if context else None,
        submission_id=context.submission_id if context else None,
        input_tokens=captured.input_tokens if captured and status == "success" else 0,
        output_tokens=captured.output_tokens if captured and status == "success" else 0,
        duration_ms=duration_ms,
        status=status,
        error_message=error_message[:2000] if error_message else None,
    )
    try:
        async with async_session_factory() as db:
            db.add(row)
            await db.commit()
    except Exception as exc:  # 用量记录失败不能影响主业务请求
        logger.error(
            "ai_usage_log_write_failed",
            error=str(exc),
            model=row.model,
            purpose=row.purpose,
            status=row.status,
        )


def track_ai_usage[**P, R](
    func: Callable[P, Awaitable[R]],
) -> Callable[P, Awaitable[R]]:
    """包裹 AI 客户端 async 方法，统一记录成功和失败请求。"""

    @wraps(func)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        from src.config import settings

        client = args[0] if args else None
        # stub 没有发出外部 AI 请求，不产生用量记录。
        if client is not None and getattr(client, "enabled", True) is False:
            return await func(*args, **kwargs)

        capture_token = _captured_usage.set(None)
        started = time.perf_counter()
        fallback_model = str(
            kwargs.get("model")
            or (
                settings.GEMINI_VISION_MODEL
                if func.__name__ == "analyze_pdf_page_image"
                else settings.GEMINI_TEXT_MODEL
            )
        )
        try:
            result = await func(*args, **kwargs)
        except Exception as exc:
            duration_ms = int((time.perf_counter() - started) * 1000)
            await _write_usage_log(
                captured=_captured_usage.get(),
                duration_ms=duration_ms,
                status="failed",
                error_message=str(exc) or type(exc).__name__,
                fallback_purpose=func.__name__,
                fallback_model=fallback_model,
            )
            raise
        else:
            duration_ms = int((time.perf_counter() - started) * 1000)
            captured = _captured_usage.get()
            status = "success" if captured is not None else "failed"
            await _write_usage_log(
                captured=captured,
                duration_ms=duration_ms,
                status=status,
                error_message=(
                    None
                    if captured is not None
                    else "AI 响应未包含 usage_metadata"
                ),
                fallback_purpose=func.__name__,
                fallback_model=fallback_model,
            )
            return result
        finally:
            _captured_usage.reset(capture_token)

    return wrapper
