"""病历 PDF 提取进度：Redis 实时缓存 + claim_submission 数据库兜底。"""
import json
from typing import Any

import redis.asyncio as aioredis

from src.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)

TTL_SECONDS = 600
KEY_PREFIX = "claim_extract_progress:"


def _key(submission_id: int) -> str:
    return f"{KEY_PREFIX}{submission_id}"


async def report_extraction_progress(
    submission_id: int,
    percent: int,
    message: str,
    *,
    stage: str,
    status: str,
) -> None:
    try:
        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await client.setex(
            _key(submission_id),
            TTL_SECONDS,
            json.dumps(
                {"percent": percent, "message": message, "stage": stage, "status": status},
                ensure_ascii=False,
            ),
        )
        await client.aclose()
    except Exception as exc:
        logger.warning(
            "extract_progress_redis_write_failed",
            submission_id=submission_id,
            error=str(exc),
        )


async def get_extraction_progress_cached(submission_id: int) -> dict[str, Any] | None:
    try:
        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        raw = await client.get(_key(submission_id))
        await client.aclose()
        return json.loads(raw) if raw else None
    except Exception as exc:
        logger.warning(
            "extract_progress_redis_read_failed",
            submission_id=submission_id,
            error=str(exc),
        )
        return None


async def clear_extraction_progress_cached(submission_id: int) -> None:
    """清除进度缓存（重新上传或重新入队时调用，避免读到上一次 DONE）。"""
    try:
        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await client.delete(_key(submission_id))
        await client.aclose()
    except Exception as exc:
        logger.warning(
            "extract_progress_redis_clear_failed",
            submission_id=submission_id,
            error=str(exc),
        )
