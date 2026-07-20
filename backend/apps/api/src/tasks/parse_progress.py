"""模板解析进度：Redis 实时缓存 + 数据库持久化兜底。"""
import json
from typing import Any

import redis as sync_redis
import redis.asyncio as aioredis

from src.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)

TTL_SECONDS = 300
KEY_PREFIX = "template_parse_progress:"


def _key(template_id: int) -> str:
    return f"{KEY_PREFIX}{template_id}"


def report_progress_sync(template_id: int, percent: int, message: str) -> None:
    """同步写入 Redis（供 pdf_parser 等同步代码路径调用）。"""
    try:
        client = sync_redis.from_url(settings.REDIS_URL, decode_responses=True)
        client.setex(
            _key(template_id),
            TTL_SECONDS,
            json.dumps({"percent": percent, "message": message}, ensure_ascii=False),
        )
        client.close()
    except Exception as exc:
        logger.warning("parse_progress_redis_write_failed", template_id=template_id, error=str(exc))


async def report_progress(template_id: int, percent: int, message: str) -> None:
    """异步写入 Redis。"""
    try:
        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        await client.setex(
            _key(template_id),
            TTL_SECONDS,
            json.dumps({"percent": percent, "message": message}, ensure_ascii=False),
        )
        await client.aclose()
    except Exception as exc:
        logger.warning("parse_progress_redis_write_failed", template_id=template_id, error=str(exc))


async def get_progress_cached(template_id: int) -> dict[str, Any] | None:
    """读取 Redis 中的实时进度，不存在则返回 None。"""
    try:
        client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        raw = await client.get(_key(template_id))
        await client.aclose()
        if not raw:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning("parse_progress_redis_read_failed", template_id=template_id, error=str(exc))
        return None
