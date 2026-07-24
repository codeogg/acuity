"""模拟会话超时：绝对超时 + proxy 空闲超时。"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from src.modules.impersonation.expiry import (
    PROXY_IDLE_MINUTES,
    is_session_timed_out,
)


def _session(**kwargs):
    now = datetime.now(UTC)
    base = dict(
        status="active",
        mode="view",
        expire_at=now + timedelta(minutes=45),
        last_active_at=now,
        started_at=now,
    )
    base.update(kwargs)
    return SimpleNamespace(**base)


def test_absolute_timeout():
    now = datetime.now(UTC)
    s = _session(expire_at=now - timedelta(seconds=1))
    assert is_session_timed_out(s, now=now) is True


def test_view_idle_does_not_expire():
    now = datetime.now(UTC)
    s = _session(
        mode="view",
        expire_at=now + timedelta(minutes=30),
        last_active_at=now - timedelta(minutes=PROXY_IDLE_MINUTES + 5),
    )
    assert is_session_timed_out(s, now=now) is False


def test_proxy_idle_timeout():
    now = datetime.now(UTC)
    s = _session(
        mode="proxy",
        expire_at=now + timedelta(minutes=20),
        last_active_at=now - timedelta(minutes=PROXY_IDLE_MINUTES + 1),
    )
    assert is_session_timed_out(s, now=now) is True


def test_proxy_within_idle_window():
    now = datetime.now(UTC)
    s = _session(
        mode="proxy",
        expire_at=now + timedelta(minutes=20),
        last_active_at=now - timedelta(minutes=PROXY_IDLE_MINUTES - 1),
    )
    assert is_session_timed_out(s, now=now) is False


@pytest.mark.asyncio
async def test_expire_if_needed_marks_expired(db_session):
    from sqlalchemy import select

    from src.db.models import DoctorClinicLink, ImpersonationSession
    from src.modules.impersonation.expiry import expire_if_needed

    link = (
        await db_session.execute(select(DoctorClinicLink).limit(1))
    ).scalar_one()
    now = datetime.now(UTC)
    row = ImpersonationSession(
        clinic_id=link.clinic_id,
        doctor_id=link.doctor_id,
        operator_id=1,
        mode="proxy",
        status="active",
        started_at=now - timedelta(minutes=30),
        expire_at=now + timedelta(minutes=10),
        last_active_at=now - timedelta(minutes=PROXY_IDLE_MINUTES + 2),
    )
    db_session.add(row)
    await db_session.flush()

    out = await expire_if_needed(db_session, row)
    assert out is None
    assert row.status == "expired"
    assert row.ended_at is not None
    # 不 commit：由 db_session fixture rollback；避免 dispose 干扰同进程其它用例
