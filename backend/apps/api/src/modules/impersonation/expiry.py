"""模拟会话超时：绝对超时 + 代理空闲超时（懒惰为主，扫描为辅）。"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.logging import get_logger
from src.db.models import ImpersonationSession
from src.modules.impersonation.token_store import revoke_session_entry_token

logger = get_logger(__name__)

# 与 start 默认绝对时长一致；空闲仅 proxy
PROXY_IDLE_MINUTES = 10


def _now() -> datetime:
    return datetime.now(UTC)


def _aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


def is_session_timed_out(session: ImpersonationSession, *, now: datetime | None = None) -> bool:
    """绝对超时，或 proxy 空闲超过 PROXY_IDLE_MINUTES。"""
    if session.status != "active":
        return False
    now = now or _now()
    expire_at = _aware(session.expire_at)
    if expire_at <= now:
        return True
    if session.mode == "proxy":
        last = session.last_active_at or session.started_at
        last = _aware(last)
        if now - last >= timedelta(minutes=PROXY_IDLE_MINUTES):
            return True
    return False


async def mark_session_expired(
    db: AsyncSession, session: ImpersonationSession, *, now: datetime | None = None
) -> None:
    now = now or _now()
    session.status = "expired"
    session.ended_at = now
    await db.flush()
    await revoke_session_entry_token(session.id)


async def expire_if_needed(
    db: AsyncSession, session: ImpersonationSession | None
) -> ImpersonationSession | None:
    """懒惰失效：仍 active 且未超时则返回 session，否则标 expired 并返回 None。"""
    if session is None:
        return None
    if session.status != "active":
        return None
    if not is_session_timed_out(session):
        return session
    await mark_session_expired(db, session)
    return None


async def touch_session_last_active(session_id: int) -> None:
    """中间件放行后刷新 last_active_at（独立 session，不阻塞失败主请求）。"""
    from src.db.session import async_session_factory

    try:
        async with async_session_factory() as db:
            row = await db.get(ImpersonationSession, session_id)
            if row is None or row.status != "active":
                return
            row.last_active_at = _now()
            await db.commit()
    except Exception:
        logger.exception("impersonation_touch_last_active_failed", session_id=session_id)


async def sweep_expired_sessions(db: AsyncSession) -> int:
    """可选扫描：批量将已超时的 active 置为 expired。返回处理条数。"""
    now = _now()
    idle_before = now - timedelta(minutes=PROXY_IDLE_MINUTES)
    result = await db.execute(
        select(ImpersonationSession).where(
            ImpersonationSession.status == "active",
            or_(
                ImpersonationSession.expire_at <= now,
                (
                    (ImpersonationSession.mode == "proxy")
                    & (
                        (
                            ImpersonationSession.last_active_at.is_not(None)
                            & (ImpersonationSession.last_active_at <= idle_before)
                        )
                        | (
                            ImpersonationSession.last_active_at.is_(None)
                            & (ImpersonationSession.started_at <= idle_before)
                        )
                    )
                ),
            ),
        )
    )
    rows = list(result.scalars().all())
    for row in rows:
        # 再走统一判断，避免 SQL 与 Python 边界偏差
        if is_session_timed_out(row, now=now):
            await mark_session_expired(db, row, now=now)
    await db.flush()
    return len(rows)


async def sweep_expired_sessions_job(ctx: dict) -> int:
    """arq cron 入口。"""
    from src.db.session import async_session_factory

    async with async_session_factory() as db:
        n = await sweep_expired_sessions(db)
        await db.commit()
    if n:
        logger.info("impersonation_sessions_swept", count=n)
    return n
