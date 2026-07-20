"""Gemini usageMetadata 解析与结构化日志。"""
from __future__ import annotations

from typing import Any

from src.core.ai_usage_interceptor import capture_ai_usage
from src.core.logging import get_logger

logger = get_logger(__name__)

TOKEN_USAGE_KEYS = (
    "prompt_token_count",
    "cached_content_token_count",
    "candidates_token_count",
    "response_token_count",
    "thoughts_token_count",
    "tool_use_prompt_token_count",
    "total_token_count",
)


def _output_token_count(usage_metadata: Any) -> int:
    """Vertex AI 用 candidates_token_count 表示输出；response_token_count 常为 0。"""
    candidates = int(getattr(usage_metadata, "candidates_token_count", None) or 0)
    if candidates > 0:
        return candidates
    return int(getattr(usage_metadata, "response_token_count", None) or 0)


def parse_usage_metadata(usage_metadata: Any | None) -> dict[str, int]:
    """从 response.usage_metadata 提取各分项 token 数。"""
    if usage_metadata is None:
        return {key: 0 for key in TOKEN_USAGE_KEYS}

    parsed: dict[str, int] = {}
    for key in TOKEN_USAGE_KEYS:
        value = getattr(usage_metadata, key, None)
        parsed[key] = int(value or 0)
    parsed["output_token_count"] = _output_token_count(usage_metadata)
    if parsed["total_token_count"] == 0:
        parsed["total_token_count"] = (
            parsed["prompt_token_count"]
            + parsed["cached_content_token_count"]
            + parsed["output_token_count"]
            + parsed["thoughts_token_count"]
            + parsed["tool_use_prompt_token_count"]
        )
    return parsed


def log_gemini_token_usage(
    *,
    usage_metadata: Any | None,
    model: str,
    location: str,
    context: str,
    thinking_level: str | None = None,
) -> dict[str, int]:
    """打印 Gemini token 消耗明细，返回解析结果供调用方复用。"""
    usage = parse_usage_metadata(usage_metadata)
    capture_ai_usage(
        model=model,
        purpose=context,
        input_tokens=usage["prompt_token_count"],
        output_tokens=usage["output_token_count"],
    )
    logger.info(
        "gemini_token_usage",
        context=context,
        model=model,
        location=location,
        thinking_level=thinking_level,
        input_tokens=usage["prompt_token_count"],
        cached_tokens=usage["cached_content_token_count"],
        output_tokens=usage["output_token_count"],
        candidates_tokens=usage["candidates_token_count"],
        response_tokens=usage["response_token_count"],
        thinking_tokens=usage["thoughts_token_count"],
        tool_use_prompt_tokens=usage["tool_use_prompt_token_count"],
        total_tokens=usage["total_token_count"],
        usage=usage,
    )
    return usage
