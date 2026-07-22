"""Pending MFA enrollment secret cache (Redis with in-memory fallback)."""
from __future__ import annotations

import time

import redis.asyncio as aioredis

from src.config import settings
from src.core.logging import get_logger

logger = get_logger(__name__)

_ENROLL_TTL_SECONDS = 600
_memory: dict[str, tuple[str, float]] = {}


def _key(doctor_id: int) -> str:
    return f"mfa_enroll:{doctor_id}"


async def _redis_client() -> aioredis.Redis | None:
    try:
        return aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    except Exception:
        return None


async def store_pending_enrollment_secret(doctor_id: int, secret: str) -> None:
    key = _key(doctor_id)
    client = await _redis_client()
    if client is not None:
        try:
            await client.setex(key, _ENROLL_TTL_SECONDS, secret)
            await client.aclose()
            return
        except Exception as exc:
            logger.warning("mfa_enroll_redis_write_failed", doctor_id=doctor_id, error=str(exc))
            try:
                await client.aclose()
            except Exception:
                pass
    _memory[key] = (secret, time.time() + _ENROLL_TTL_SECONDS)


async def pop_pending_enrollment_secret(doctor_id: int) -> str | None:
    key = _key(doctor_id)
    client = await _redis_client()
    if client is not None:
        try:
            secret = await client.get(key)
            if secret:
                await client.delete(key)
            await client.aclose()
            if secret:
                return str(secret)
        except Exception as exc:
            logger.warning("mfa_enroll_redis_read_failed", doctor_id=doctor_id, error=str(exc))
            try:
                await client.aclose()
            except Exception:
                pass
    entry = _memory.pop(key, None)
    if entry is None:
        return None
    secret, expires_at = entry
    if time.time() > expires_at:
        return None
    return secret


async def clear_pending_enrollment_secret(doctor_id: int) -> None:
    key = _key(doctor_id)
    client = await _redis_client()
    if client is not None:
        try:
            await client.delete(key)
            await client.aclose()
        except Exception:
            try:
                await client.aclose()
            except Exception:
                pass
    _memory.pop(key, None)
