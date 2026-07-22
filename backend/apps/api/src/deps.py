"""FastAPI 依赖注入：数据库会话 + 当前用户（管理员 / 医生）。

鉴权采用 JWT，Token 可来自 Authorization: Bearer，也兼容 httpOnly Cookie(access_token)。
"""
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import AuthException, ForbiddenException
from src.core.security import decode_access_token
from src.db.session import get_db

DbSession = Annotated[AsyncSession, Depends(get_db)]

ADMIN_ROLES = {"SUPER_ADMIN", "OPERATOR", "ANNOTATOR"}


@dataclass
class CurrentUser:
    id: int
    role: str
    clinic_id: int | None = None


def _extract_token(request: Request) -> str:
    auth = request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:]
    cookie_token = request.cookies.get("access_token")
    if cookie_token:
        return cookie_token
    raise AuthException("缺少登录凭证")


def get_current_user(request: Request) -> CurrentUser:
    payload = decode_access_token(_extract_token(request))
    return CurrentUser(
        id=int(payload["sub"]),
        role=payload["role"],
        clinic_id=payload.get("clinic_id"),
    )


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_admin(user: CurrentUserDep) -> CurrentUser:
    if user.role not in ADMIN_ROLES:
        raise ForbiddenException("需要管理员权限")
    return user


def require_roles(*roles: str):
    def _checker(user: CurrentUserDep) -> CurrentUser:
        if user.role not in roles:
            raise ForbiddenException("权限不足")
        return user

    return _checker


@dataclass
class CurrentDoctor:
    id: int
    clinic_id: int


def get_current_doctor(user: CurrentUserDep) -> CurrentDoctor:
    """所有 /api/doctor/** 接口必须使用，强制携带 clinic_id 做数据隔离。"""
    if user.role != "DOCTOR" or user.clinic_id is None:
        raise ForbiddenException("需要医生身份")
    return CurrentDoctor(id=user.id, clinic_id=user.clinic_id)


AdminDep = Annotated[CurrentUser, Depends(require_admin)]
# 「高级管理员」→ SUPER_ADMIN（种子账号 real_name「超级管理员」）
SuperAdminDep = Annotated[CurrentUser, Depends(require_roles("SUPER_ADMIN"))]
DoctorDep = Annotated[CurrentDoctor, Depends(get_current_doctor)]


def client_ip(request: Request) -> str | None:
    """Best-effort client IP (honours first X-Forwarded-For hop)."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    if request.client is not None:
        return request.client.host
    return None

