"""医生端模拟入口：与 /auth/login 完全独立，不走密码 / MFA / 选诊所。"""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import AuthException, ForbiddenException
from src.db.models import Clinic, Doctor, ImpersonationSession
from src.modules.impersonation.expiry import expire_if_needed
from src.modules.impersonation.schemas import (
    ImpersonationContextOut,
    ImpersonationEntryResponse,
)
from src.modules.impersonation.token_store import (
    consume_entry_jti,
    revoke_session_entry_token,
)
from src.modules.impersonation.tokens import (
    create_impersonation_access_token,
    decode_impersonation_entry_token,
)


def _now() -> datetime:
    return datetime.now(UTC)


async def enter_impersonation_session(
    db: AsyncSession, *, entry_token: str
) -> ImpersonationEntryResponse:
    raw = (entry_token or "").strip()
    if not raw:
        raise AuthException("缺少模拟令牌", code="IMPERSONATION_TOKEN_MISSING")

    payload = decode_impersonation_entry_token(raw)
    session_id = int(payload["session_id"])
    operator_id = int(payload["operator_id"])
    doctor_id = int(payload["doctor_id"])
    clinic_id = int(payload["clinic_id"])
    mode = str(payload["mode"])
    jti = str(payload["jti"])

    if mode not in ("view", "proxy"):
        raise AuthException(
            "模拟令牌内容不完整",
            code="IMPERSONATION_TOKEN_INCOMPLETE",
        )

    consumed = await consume_entry_jti(jti=jti, session_id=session_id)
    if not consumed:
        raise AuthException(
            "模拟令牌已使用或已失效",
            code="IMPERSONATION_TOKEN_USED",
        )

    session = await db.get(ImpersonationSession, session_id)
    if session is None:
        raise AuthException(
            "模拟会话不存在或已结束",
            code="IMPERSONATION_SESSION_INACTIVE",
        )
    if session.status == "expired":
        raise AuthException(
            "模拟会话已超时失效",
            code="IMPERSONATION_SESSION_EXPIRED",
        )
    if session.status != "active":
        raise AuthException(
            "模拟会话不存在或已结束",
            code="IMPERSONATION_SESSION_INACTIVE",
        )

    session = await expire_if_needed(db, session)
    if session is None:
        raise AuthException(
            "模拟会话已超时失效",
            code="IMPERSONATION_SESSION_EXPIRED",
        )

    if (
        session.operator_id != operator_id
        or session.doctor_id != doctor_id
        or session.clinic_id != clinic_id
        or session.mode != mode
    ):
        raise AuthException(
            "模拟令牌与会话不匹配",
            code="IMPERSONATION_TOKEN_MISMATCH",
        )

    doctor = await db.get(Doctor, doctor_id)
    if doctor is None or doctor.status != 1:
        raise ForbiddenException(
            "目标医生或诊所不可用",
            code="IMPERSONATION_TARGET_UNAVAILABLE",
        )
    clinic = await db.get(Clinic, clinic_id)
    if clinic is None or clinic.status != 1:
        raise ForbiddenException(
            "目标医生或诊所不可用",
            code="IMPERSONATION_TARGET_UNAVAILABLE",
        )

    access_token = create_impersonation_access_token(
        session_id=session.id,
        operator_id=session.operator_id,
        doctor_id=session.doctor_id,
        clinic_id=session.clinic_id,
        mode=session.mode,  # type: ignore[arg-type]
        expire_at=session.expire_at,
    )

    return ImpersonationEntryResponse(
        access_token=access_token,
        user_id=doctor.id,
        clinic_id=clinic.id,
        display_name=doctor.doctor_name,
        impersonation=ImpersonationContextOut(
            session_id=session.id,
            operator_id=session.operator_id,
            doctor_id=session.doctor_id,
            clinic_id=session.clinic_id,
            mode=session.mode,  # type: ignore[arg-type]
        ),
    )


async def exit_impersonation_session(
    db: AsyncSession,
    *,
    impersonation: dict,
) -> None:
    """医生端标签页退出：结束会话（与运营端 end 同效果）。

    医生页仅持有模拟 JWT，无法走需 AdminDep 的 /admin/impersonation/end。
    """
    session_id = int(impersonation["session_id"])
    session = await db.get(ImpersonationSession, session_id)
    if session is None:
        return
    if (
        session.operator_id != int(impersonation["operator_id"])
        or session.doctor_id != int(impersonation["doctor_id"])
        or session.clinic_id != int(impersonation["clinic_id"])
    ):
        raise ForbiddenException("模拟会话不匹配")
    if session.status == "active":
        session.status = "ended"
        session.ended_at = _now()
        await db.flush()
        await revoke_session_entry_token(session.id)
