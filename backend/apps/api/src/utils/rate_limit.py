"""基于 Redis 的滑动窗口限流（每诊所每分钟）。Redis 不可用时放行（不阻塞业务）。"""
import time

from redis.asyncio import Redis

from src.config import settings
from src.core.exceptions import RateLimitException
from src.core.logging import get_logger

logger = get_logger(__name__)

_redis: Redis | None = None


def _get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


async def check_ai_rate_limit(clinic_id: int) -> None:
    limit = settings.AI_RATE_LIMIT_PER_MINUTE
    window = 60
    key = f"ratelimit:ai:{clinic_id}:{int(time.time()) // window}"
    try:
        redis = _get_redis()
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, window)
        if count > limit:
            raise RateLimitException("AI 调用过于频繁，请稍后再试")
    except RateLimitException:
        raise
    except Exception as exc:
        logger.warning("rate_limit_skipped", error=str(exc))
