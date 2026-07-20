"""Gemini 调用失败时的降级策略。"""
from __future__ import annotations

from src.config import settings
from src.core.exceptions import AiServiceUnavailableError
from src.core.logging import get_logger

logger = get_logger(__name__)


def should_stub_on_ai_error() -> bool:
    return settings.gemini_stub_on_error


def log_ai_fallback(step: str, *, model: str, reason: str) -> None:
    logger.warning(
        "gemini_fallback_stub",
        step=step,
        model=model,
        reason=reason,
        app_env=settings.APP_ENV,
    )


async def call_or_stub(
    step: str,
    *,
    model: str,
    call,
    stub,
):
    """本地开发时 AI 不可用则返回 stub 结果，生产环境继续抛出异常。"""
    if not should_stub_on_ai_error():
        return await call()
    try:
        return await call()
    except AiServiceUnavailableError as exc:
        log_ai_fallback(step, model=model, reason=exc.message)
        return stub()
