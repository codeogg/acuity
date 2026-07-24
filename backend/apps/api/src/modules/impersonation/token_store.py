"""模拟入口令牌一次性状态：jti 白名单 + 按 session 作废旧令牌。

Redis 优先；不可用时降级进程内 dict（与 mfa/cache 相同取舍）。
"""
from __future__ import annotations

import time

import redis.asyncio as aioredis

from src.config import settings
from src.core.logging import get_logger
from src.modules.impersonation.tokens import IMPERSONATION_ENTRY_TTL

logger = get_logger(__name__)

_TTL_SECONDS = int(IMPERSONATION_ENTRY_TTL.total_seconds())
_memory_jti: dict[str, tuple[str, float]] = {}
_memory_session: dict[str, tuple[str, float]] = {}


def _jti_key(jti: str) -> str:
    return f"impersonation:entry:{jti}"


def _session_jti_key(session_id: int) -> str:
    return f"impersonation:session:{session_id}:jti"


async def _redis_client() -> aioredis.Redis | None:
    try:
        return aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        return None


async def register_entry_jti(*, session_id: int, jti: str) -> None:
    """登记新 jti，并作废同一 session 上一次未使用的 jti。"""
    session_key = _session_jti_key(session_id)
    jti_key = _jti_key(jti)
    expires_at = time.time() + _TTL_SECONDS

    client = await _redis_client()
    if client is not None:
        try:
            old = await client.get(session_key)
            pipe = client.pipeline()
            if old and old != jti:
                pipe.delete(_jti_key(str(old)))
            pipe.setex(jti_key, _TTL_SECONDS, str(session_id))
            pipe.setex(session_key, _TTL_SECONDS, jti)
            await pipe.execute()
            await client.aclose()
            return
        except Exception as exc:
            logger.warning(
                "impersonation_jti_redis_write_failed",
                session_id=session_id,
                error=str(exc),
            )
            try:
                await client.aclose()
            except Exception:
                pass

    old_entry = _memory_session.get(session_key)
    if old_entry is not None:
        old_jti, _ = old_entry
        if old_jti != jti:
            _memory_jti.pop(_jti_key(old_jti), None)
    _memory_jti[jti_key] = (str(session_id), expires_at)
    _memory_session[session_key] = (jti, expires_at)


async def consume_entry_jti(*, jti: str, session_id: int) -> bool:
    """原子消费 jti。成功返回 True；已用/过期/不匹配返回 False。

    医生端校验下一步会调用；本步先实现供 start 配套完整。
    """
    jti_key = _jti_key(jti)
    session_key = _session_jti_key(session_id)

    client = await _redis_client()
    if client is not None:
        try:
            # GETDEL：一次性取出并删除
            value = await client.getdel(jti_key)
            if value is None:
                await client.aclose()
                return False
            if str(value) != str(session_id):
                await client.aclose()
                return False
            # 清掉 session→jti 指针（仅当仍指向本 jti）
            current = await client.get(session_key)
            if current == jti:
                await client.delete(session_key)
            await client.aclose()
            return True
        except Exception as exc:
            logger.warning(
                "impersonation_jti_redis_consume_failed",
                session_id=session_id,
                error=str(exc),
            )
            try:
                await client.aclose()
            except Exception:
                pass

    entry = _memory_jti.pop(jti_key, None)
    if entry is None:
        return False
    stored_session_id, exp = entry
    if time.time() > exp or stored_session_id != str(session_id):
        return False
    sess = _memory_session.get(session_key)
    if sess is not None and sess[0] == jti:
        _memory_session.pop(session_key, None)
    return True


async def revoke_session_entry_token(session_id: int) -> None:
    """结束会话时作废尚未使用的入口令牌。"""
    session_key = _session_jti_key(session_id)
    client = await _redis_client()
    if client is not None:
        try:
            old = await client.get(session_key)
            pipe = client.pipeline()
            if old:
                pipe.delete(_jti_key(str(old)))
            pipe.delete(session_key)
            await pipe.execute()
            await client.aclose()
            return
        except Exception as exc:
            logger.warning(
                "impersonation_jti_redis_revoke_failed",
                session_id=session_id,
                error=str(exc),
            )
            try:
                await client.aclose()
            except Exception:
                pass

    old_entry = _memory_session.pop(session_key, None)
    if old_entry is not None:
        _memory_jti.pop(_jti_key(old_entry[0]), None)
