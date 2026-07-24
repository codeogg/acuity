"""模拟入口令牌：JWT 签发 / 解码（一次性消费状态在 token_store）。

业务会话令牌刻意分叉：不复用 create_access_token，单独签发并携带
impersonation_context，与真医生登录 JWT 可区分。
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, Literal
from uuid import uuid4

from jose import ExpiredSignatureError, JWTError, jwt

from src.config import settings
from src.core.exceptions import AuthException

IMPERSONATION_ENTRY_TYP = "impersonation_entry"
IMPERSONATION_SESSION_TYP = "impersonation_session"
IMPERSONATION_ENTRY_TTL = timedelta(minutes=5)

ImpersonationMode = Literal["view", "proxy"]


def create_impersonation_entry_token(
    *,
    session_id: int,
    operator_id: int,
    doctor_id: int,
    clinic_id: int,
    mode: ImpersonationMode,
    jti: str | None = None,
) -> tuple[str, str]:
    """签发 5 分钟模拟入口 JWT。返回 (token, jti)。"""
    nonce = jti or str(uuid4())
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "typ": IMPERSONATION_ENTRY_TYP,
        "session_id": session_id,
        "operator_id": operator_id,
        "doctor_id": doctor_id,
        "clinic_id": clinic_id,
        "mode": mode,
        "jti": nonce,
        "iat": now,
        "exp": now + IMPERSONATION_ENTRY_TTL,
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, nonce


def decode_impersonation_entry_token(token: str) -> dict[str, Any]:
    """验签并校验 typ；不做一次性消费（由 token_store 负责）。"""
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except ExpiredSignatureError as exc:
        raise AuthException(
            "模拟令牌已过期，请从运营端重新发起",
            code="IMPERSONATION_TOKEN_EXPIRED",
        ) from exc
    except JWTError as exc:
        raise AuthException(
            "模拟令牌无效",
            code="IMPERSONATION_TOKEN_INVALID",
        ) from exc
    if payload.get("typ") != IMPERSONATION_ENTRY_TYP:
        raise AuthException(
            "模拟令牌类型不正确",
            code="IMPERSONATION_TOKEN_TYPE",
        )
    for key in ("session_id", "operator_id", "doctor_id", "clinic_id", "mode", "jti"):
        if key not in payload:
            raise AuthException(
                "模拟令牌内容不完整",
                code="IMPERSONATION_TOKEN_INCOMPLETE",
            )
    return payload


def create_impersonation_access_token(
    *,
    session_id: int,
    operator_id: int,
    doctor_id: int,
    clinic_id: int,
    mode: ImpersonationMode,
    expire_at: datetime,
) -> str:
    """签发模拟业务会话 JWT（刻意分叉，不调用 create_access_token）。

    - sub/role/clinic_id：与医生端数据隔离约定兼容
    - typ + impersonation：标记为模拟会话，供后续切面识别
    - exp：不超过模拟会话 expire_at，且不超过全局 JWT 时长
    """
    now = datetime.now(UTC)
    if expire_at.tzinfo is None:
        expire_at = expire_at.replace(tzinfo=UTC)
    max_exp = now + timedelta(hours=settings.JWT_EXPIRE_HOURS)
    exp = min(expire_at, max_exp)
    if exp <= now:
        raise AuthException(
            "模拟会话不存在或已结束",
            code="IMPERSONATION_SESSION_INACTIVE",
        )
    payload: dict[str, Any] = {
        "typ": IMPERSONATION_SESSION_TYP,
        "sub": str(doctor_id),
        "role": "DOCTOR",
        "clinic_id": clinic_id,
        "impersonation": {
            "session_id": session_id,
            "operator_id": operator_id,
            "doctor_id": doctor_id,
            "clinic_id": clinic_id,
            "mode": mode,
        },
        "iat": now,
        "exp": exp,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
