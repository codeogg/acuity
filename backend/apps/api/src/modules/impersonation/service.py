"""运营端模拟会话：start / end / session 查询。"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.core.exceptions import (
    AppException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
)
from src.db.models import AdminUser, DoctorClinicLink, ImpersonationSession
from src.modules.impersonation.schemas import (
    ImpersonationEndRequest,
    ImpersonationMode,
    ImpersonationSessionOut,
    ImpersonationSessionStateOut,
    ImpersonationStartRequest,
)
from src.modules.impersonation.token_store import (
    register_entry_jti,
    revoke_session_entry_token,
)
from src.modules.impersonation.tokens import create_impersonation_entry_token
from src.modules.impersonation.expiry import expire_if_needed

# 绝对超时默认值与允许区间（分钟）
_VIEW_DEFAULT_MINUTES = 45
_VIEW_MIN_MINUTES = 30
_VIEW_MAX_MINUTES = 60
_PROXY_DEFAULT_MINUTES = 20
_PROXY_MIN_MINUTES = 15
_PROXY_MAX_MINUTES = 30


def _now() -> datetime:
    return datetime.now(UTC)


def _resolve_duration(mode: ImpersonationMode, requested: int | None) -> int:
    if mode == "view":
        default, lo, hi = _VIEW_DEFAULT_MINUTES, _VIEW_MIN_MINUTES, _VIEW_MAX_MINUTES
    else:
        default, lo, hi = _PROXY_DEFAULT_MINUTES, _PROXY_MIN_MINUTES, _PROXY_MAX_MINUTES
    minutes = default if requested is None else requested
    if minutes < lo or minutes > hi:
        raise ValidationException(
            f"{mode} 模式时长须在 {lo}–{hi} 分钟之间",
            code="INVALID_DURATION",
        )
    return minutes


async def _operator_label(db: AsyncSession, operator_id: int) -> str:
    row = await db.get(AdminUser, operator_id)
    if row is None:
        return str(operator_id)
    return (row.real_name or row.username or str(operator_id)).strip()


def build_entry_url(token: str) -> str:
    """医生端专用入口：/{locale}/impersonation-entry?token=…（与 login 无关）。"""
    base = settings.DOCTOR_APP_BASE_URL.rstrip("/")
    locale = (settings.DOCTOR_APP_LOCALE or "en-HK").strip().strip("/")
    return f"{base}/{locale}/impersonation-entry?token={quote(token, safe='')}"


def _to_out(
    session: ImpersonationSession,
    *,
    operator: str,
    reused: bool = False,
    token: str | None = None,
) -> ImpersonationSessionOut:
    return ImpersonationSessionOut(
        session_id=session.id,
        clinic_id=session.clinic_id,
        doctor_id=session.doctor_id,
        operator_id=session.operator_id,
        operator=operator,
        mode=session.mode,  # type: ignore[arg-type]
        status=session.status,  # type: ignore[arg-type]
        reason=session.reason,
        started_at=session.started_at,
        expire_at=session.expire_at,
        reused=reused,
        token=token,
        entry_url=build_entry_url(token) if token else None,
    )


async def _issue_entry_token(session: ImpersonationSession) -> str:
    token, jti = create_impersonation_entry_token(
        session_id=session.id,
        operator_id=session.operator_id,
        doctor_id=session.doctor_id,
        clinic_id=session.clinic_id,
        mode=session.mode,  # type: ignore[arg-type]
    )
    await register_entry_jti(session_id=session.id, jti=jti)
    return token


async def _get_active(
    db: AsyncSession, clinic_id: int, doctor_id: int
) -> ImpersonationSession | None:
    result = await db.execute(
        select(ImpersonationSession).where(
            ImpersonationSession.clinic_id == clinic_id,
            ImpersonationSession.doctor_id == doctor_id,
            ImpersonationSession.status == "active",
        )
    )
    return result.scalar_one_or_none()


async def _ensure_doctor_clinic_link(
    db: AsyncSession, clinic_id: int, doctor_id: int
) -> None:
    result = await db.execute(
        select(DoctorClinicLink.id).where(
            DoctorClinicLink.clinic_id == clinic_id,
            DoctorClinicLink.doctor_id == doctor_id,
        )
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundException("医生未关联该诊所")


async def start_impersonation(
    db: AsyncSession,
    body: ImpersonationStartRequest,
    *,
    operator_id: int,
) -> ImpersonationSessionOut:
    if body.mode == "proxy" and body.confirmed is not True:
        raise AppException(
            "代理模式须二次确认（confirmed=true）",
            code="CONFIRMATION_REQUIRED",
        )

    await _ensure_doctor_clinic_link(db, body.clinic_id, body.doctor_id)

    existing = await expire_if_needed(
        db, await _get_active(db, body.clinic_id, body.doctor_id)
    )

    if existing is not None:
        if existing.operator_id != operator_id:
            raise ConflictException("该诊所医生已有其他运营的活跃模拟会话")
        # 本人复用：不改 mode / expire_at；仅刷新活跃时间，并签发新令牌（作废旧 jti）
        existing.last_active_at = _now()
        await db.flush()
        label = await _operator_label(db, existing.operator_id)
        token = await _issue_entry_token(existing)
        return _to_out(existing, operator=label, reused=True, token=token)

    minutes = _resolve_duration(body.mode, body.duration_minutes)
    now = _now()
    session = ImpersonationSession(
        clinic_id=body.clinic_id,
        doctor_id=body.doctor_id,
        operator_id=operator_id,
        mode=body.mode,
        reason=body.reason,
        status="active",
        started_at=now,
        expire_at=now + timedelta(minutes=minutes),
        last_active_at=now,
    )
    db.add(session)
    await db.flush()
    label = await _operator_label(db, operator_id)
    token = await _issue_entry_token(session)
    return _to_out(session, operator=label, reused=False, token=token)


async def end_impersonation(
    db: AsyncSession,
    body: ImpersonationEndRequest,
    *,
    operator_id: int,
) -> None:
    session = await expire_if_needed(
        db, await _get_active(db, body.clinic_id, body.doctor_id)
    )
    if session is None:
        raise NotFoundException("无活跃模拟会话")
    if session.operator_id != operator_id:
        raise ForbiddenException("无权结束其他运营的模拟会话")

    session.status = "ended"
    session.ended_at = _now()
    await db.flush()
    await revoke_session_entry_token(session.id)


async def get_impersonation_session(
    db: AsyncSession,
    *,
    clinic_id: int,
    doctor_id: int,
) -> ImpersonationSessionStateOut:
    session = await expire_if_needed(
        db, await _get_active(db, clinic_id, doctor_id)
    )
    if session is None:
        return ImpersonationSessionStateOut(active=None)
    label = await _operator_label(db, session.operator_id)
    return ImpersonationSessionStateOut(
        active=_to_out(session, operator=label, reused=False, token=None)
    )
