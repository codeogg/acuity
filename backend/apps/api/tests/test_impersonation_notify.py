"""医生端 support-access pending / acknowledge（5.6）。"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from src.core.exceptions import ForbiddenException, NotFoundException
from src.db.models import DoctorClinicLink, ImpersonationSession
from src.modules.impersonation import notify


def _now() -> datetime:
    return datetime.now(UTC)


async def _add_ended_session(
    db,
    *,
    clinic_id: int,
    doctor_id: int,
    operator_id: int = 1,
    mode: str = "view",
    status: str = "ended",
    notified: bool = False,
    acknowledged: bool = False,
    reason: str | None = None,
) -> ImpersonationSession:
    now = _now()
    row = ImpersonationSession(
        clinic_id=clinic_id,
        doctor_id=doctor_id,
        operator_id=operator_id,
        mode=mode,
        reason=reason or f"reason-{mode}",
        status=status,
        started_at=now - timedelta(minutes=30),
        ended_at=now - timedelta(minutes=5),
        expire_at=now + timedelta(minutes=15),
        last_active_at=now - timedelta(minutes=5),
        doctor_notified_at=now - timedelta(minutes=1) if notified else None,
        doctor_acknowledged_at=now if acknowledged else None,
    )
    db.add(row)
    await db.flush()
    return row


@pytest.mark.asyncio
async def test_pending_returns_multiple_unmerged_and_marks_notified(db_session):
    link = (
        await db_session.execute(select(DoctorClinicLink).limit(1))
    ).scalar_one()

    s1 = await _add_ended_session(
        db_session,
        clinic_id=link.clinic_id,
        doctor_id=link.doctor_id,
        mode="view",
        reason="ops-a",
    )
    s2 = await _add_ended_session(
        db_session,
        clinic_id=link.clinic_id,
        doctor_id=link.doctor_id,
        mode="proxy",
        status="expired",
        reason="ops-b",
    )
    await _add_ended_session(
        db_session,
        clinic_id=link.clinic_id,
        doctor_id=link.doctor_id,
        notified=True,
        acknowledged=True,
        reason="already-acked",
    )

    out = await notify.list_pending_support_access(
        db_session, doctor_id=link.doctor_id
    )
    ids = {item.session_id for item in out.items}
    assert s1.id in ids and s2.id in ids
    # 同医生多条独立返回，不合并成一条
    assert len(ids) == len(out.items)
    assert len(out.items) >= 2

    await db_session.refresh(s1)
    await db_session.refresh(s2)
    assert s1.doctor_notified_at is not None
    assert s2.doctor_notified_at is not None

    # 未 acknowledge 前再次拉取仍应返回（避免首次拉取后前端未展示就丢通知）
    out2 = await notify.list_pending_support_access(
        db_session, doctor_id=link.doctor_id
    )
    remaining = {i.session_id for i in out2.items}
    assert s1.id in remaining
    assert s2.id in remaining

    await notify.acknowledge_support_access(
        db_session, doctor_id=link.doctor_id, session_id=s1.id
    )
    out3 = await notify.list_pending_support_access(
        db_session, doctor_id=link.doctor_id
    )
    remaining3 = {i.session_id for i in out3.items}
    assert s1.id not in remaining3
    assert s2.id in remaining3


@pytest.mark.asyncio
async def test_pending_scoped_to_all_bound_clinics_not_jwt_clinic(db_session):
    """查询按 doctor_clinic_link 全集，不依赖调用方传入的当前 clinic。"""
    from src.db.models import Clinic

    link = (
        await db_session.execute(select(DoctorClinicLink).limit(1))
    ).scalar_one()
    other_clinic = (
        await db_session.execute(
            select(Clinic).where(Clinic.id != link.clinic_id).limit(1)
        )
    ).scalar_one_or_none()
    if other_clinic is None:
        pytest.skip("need a second clinic in seed")

    # 临时绑定第二诊所（测试结束 rollback）
    extra = DoctorClinicLink(
        doctor_id=link.doctor_id,
        clinic_id=other_clinic.id,
        is_primary=False,
    )
    db_session.add(extra)
    await db_session.flush()

    s_home = await _add_ended_session(
        db_session,
        clinic_id=link.clinic_id,
        doctor_id=link.doctor_id,
        reason="home-clinic",
    )
    s_other = await _add_ended_session(
        db_session,
        clinic_id=other_clinic.id,
        doctor_id=link.doctor_id,
        reason="other-clinic",
    )

    out = await notify.list_pending_support_access(
        db_session, doctor_id=link.doctor_id
    )
    ids = {item.session_id for item in out.items}
    assert s_home.id in ids
    assert s_other.id in ids


@pytest.mark.asyncio
async def test_acknowledge_writes_acknowledged_at(db_session):
    link = (
        await db_session.execute(select(DoctorClinicLink).limit(1))
    ).scalar_one()
    row = await _add_ended_session(
        db_session,
        clinic_id=link.clinic_id,
        doctor_id=link.doctor_id,
        notified=True,
    )

    await notify.acknowledge_support_access(
        db_session, doctor_id=link.doctor_id, session_id=row.id
    )
    await db_session.refresh(row)
    assert row.doctor_acknowledged_at is not None

    first = row.doctor_acknowledged_at
    await notify.acknowledge_support_access(
        db_session, doctor_id=link.doctor_id, session_id=row.id
    )
    await db_session.refresh(row)
    assert row.doctor_acknowledged_at == first


@pytest.mark.asyncio
async def test_acknowledge_rejects_other_doctor(db_session):
    links = (
        await db_session.execute(select(DoctorClinicLink).limit(10))
    ).scalars().all()
    link = links[0]
    other = next((l for l in links if l.doctor_id != link.doctor_id), None)
    if other is None:
        pytest.skip("need two doctors in seed data")

    row = await _add_ended_session(
        db_session, clinic_id=link.clinic_id, doctor_id=link.doctor_id
    )
    with pytest.raises(ForbiddenException):
        await notify.acknowledge_support_access(
            db_session, doctor_id=other.doctor_id, session_id=row.id
        )


@pytest.mark.asyncio
async def test_acknowledge_rejects_active_session(db_session):
    link = (
        await db_session.execute(select(DoctorClinicLink).limit(1))
    ).scalar_one()
    # 避免与已有 active 冲突：先清掉同 clinic+doctor 的 active（rollback 恢复）
    existing = (
        await db_session.execute(
            select(ImpersonationSession).where(
                ImpersonationSession.clinic_id == link.clinic_id,
                ImpersonationSession.doctor_id == link.doctor_id,
                ImpersonationSession.status == "active",
            )
        )
    ).scalars().all()
    for row in existing:
        row.status = "ended"
        row.ended_at = _now()

    active = ImpersonationSession(
        clinic_id=link.clinic_id,
        doctor_id=link.doctor_id,
        operator_id=1,
        mode="view",
        status="active",
        started_at=_now(),
        expire_at=_now() + timedelta(minutes=30),
        last_active_at=_now(),
    )
    db_session.add(active)
    await db_session.flush()

    with pytest.raises(NotFoundException):
        await notify.acknowledge_support_access(
            db_session, doctor_id=link.doctor_id, session_id=active.id
        )
