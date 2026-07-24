"""医生端事后通知（设计文档 5.6）：pending 查询 + acknowledge。

与 /auth/login 解耦；由前端在登录成功后异步调用。
"""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ForbiddenException, NotFoundException
from src.db.models import AdminUser, Clinic, DoctorClinicLink, ImpersonationSession
from src.modules.impersonation.schemas import (
    SupportAccessPendingItem,
    SupportAccessPendingOut,
)


def _now() -> datetime:
    return datetime.now(UTC)


async def _operator_label(db: AsyncSession, operator_id: int) -> str:
    row = await db.get(AdminUser, operator_id)
    if row is None:
        return str(operator_id)
    return (row.real_name or row.username or str(operator_id)).strip()


async def list_pending_support_access(
    db: AsyncSession,
    *,
    doctor_id: int,
) -> SupportAccessPendingOut:
    """查医生全部绑定诊所内未确认的已结束会话；返回时写 doctor_notified_at。

    以 doctor_acknowledged_at 为空为准（未点确定前可再次拉取），避免首次
    拉取已写 notified 但前端未展示时通知永久丢失。
    """
    linked_clinic_ids = (
        select(DoctorClinicLink.clinic_id)
        .where(DoctorClinicLink.doctor_id == doctor_id)
        .scalar_subquery()
    )
    result = await db.execute(
        select(ImpersonationSession)
        .where(
            ImpersonationSession.doctor_id == doctor_id,
            ImpersonationSession.clinic_id.in_(linked_clinic_ids),
            ImpersonationSession.status.in_(("ended", "expired")),
            ImpersonationSession.doctor_acknowledged_at.is_(None),
        )
        .order_by(
            ImpersonationSession.ended_at.desc().nulls_last(),
            ImpersonationSession.id.desc(),
        )
        .with_for_update()
    )
    sessions = list(result.scalars().all())
    if not sessions:
        return SupportAccessPendingOut(items=[])

    now = _now()
    clinic_ids = {s.clinic_id for s in sessions}
    clinic_rows = (
        await db.execute(select(Clinic).where(Clinic.id.in_(clinic_ids)))
    ).scalars().all()
    clinic_names = {c.id: c.clinic_name for c in clinic_rows}

    operator_ids = {s.operator_id for s in sessions}
    labels: dict[int, str] = {}
    for oid in operator_ids:
        labels[oid] = await _operator_label(db, oid)

    items: list[SupportAccessPendingItem] = []
    for session in sessions:
        if session.doctor_notified_at is None:
            session.doctor_notified_at = now
        items.append(
            SupportAccessPendingItem(
                session_id=session.id,
                clinic_id=session.clinic_id,
                clinic_name=clinic_names.get(session.clinic_id),
                doctor_id=session.doctor_id,
                operator_id=session.operator_id,
                operator=labels[session.operator_id],
                mode=session.mode,  # type: ignore[arg-type]
                status=session.status,  # type: ignore[arg-type]
                reason=session.reason,
                started_at=session.started_at,
                ended_at=session.ended_at,
                expire_at=session.expire_at,
                doctor_notified_at=session.doctor_notified_at or now,
            )
        )

    await db.flush()
    return SupportAccessPendingOut(items=items)


async def acknowledge_support_access(
    db: AsyncSession,
    *,
    doctor_id: int,
    session_id: int,
) -> None:
    """医生确认知晓：回写 doctor_acknowledged_at（幂等）。"""
    session = await db.get(ImpersonationSession, session_id)
    if session is None:
        raise NotFoundException("模拟会话不存在")
    if session.doctor_id != doctor_id:
        raise ForbiddenException("无权确认该模拟记录")
    if session.status not in ("ended", "expired"):
        raise NotFoundException("仅已结束的模拟记录可确认")

    # 仍须在医生当前绑定诊所范围内
    linked = await db.execute(
        select(DoctorClinicLink.id).where(
            DoctorClinicLink.doctor_id == doctor_id,
            DoctorClinicLink.clinic_id == session.clinic_id,
        )
    )
    if linked.scalar_one_or_none() is None:
        raise ForbiddenException("无权确认该模拟记录")

    now = _now()
    if session.doctor_notified_at is None:
        session.doctor_notified_at = now
    if session.doctor_acknowledged_at is None:
        session.doctor_acknowledged_at = now
    await db.flush()
