"""分端会话 Cookie：运营端与医生端隔离，避免 localhost 共 host 互相覆盖。

生产环境通常分域名；本地同为 localhost 不同端口时 Cookie 仍共享，
因此必须使用不同 Cookie 名。
"""
from __future__ import annotations

from typing import Literal

from fastapi import Request, Response

ADMIN_ROLES = frozenset({"SUPER_ADMIN", "OPERATOR", "ANNOTATOR"})

ADMIN_ACCESS_COOKIE = "admin_access_token"
DOCTOR_ACCESS_COOKIE = "doctor_access_token"
LEGACY_ACCESS_COOKIE = "access_token"

Surface = Literal["admin", "doctor"]

_COOKIE_MAX_AGE = 8 * 3600
_SURFACE_HEADER = "x-acuity-surface"


def cookie_name_for_role(role: str) -> str:
    if role in ADMIN_ROLES:
        return ADMIN_ACCESS_COOKIE
    return DOCTOR_ACCESS_COOKIE


def cookie_name_for_surface(surface: Surface) -> str:
    return ADMIN_ACCESS_COOKIE if surface == "admin" else DOCTOR_ACCESS_COOKIE


def resolve_surface(request: Request) -> Surface | None:
    """从 Header / 路径推断当前请求所属前端。"""
    raw = (request.headers.get(_SURFACE_HEADER) or "").strip().lower()
    if raw in ("admin", "doctor"):
        return raw  # type: ignore[return-value]
    path = request.url.path
    if path.startswith("/api/admin"):
        return "admin"
    if path.startswith("/api/doctor"):
        return "doctor"
    return None


def set_access_cookie(
    response: Response,
    token: str,
    *,
    role: str | None = None,
    surface: Surface | None = None,
) -> None:
    if surface is not None:
        key = cookie_name_for_surface(surface)
    elif role is not None:
        key = cookie_name_for_role(role)
    else:
        key = DOCTOR_ACCESS_COOKIE
    response.set_cookie(
        key=key,
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,
        max_age=_COOKIE_MAX_AGE,
        path="/",
    )
    # 清掉旧共用 Cookie，避免继续踩踏另一端
    response.delete_cookie(LEGACY_ACCESS_COOKIE, path="/")


def clear_access_cookie(response: Response, *, surface: Surface) -> None:
    """只清除本端会话 Cookie，不影响另一端。"""
    response.delete_cookie(cookie_name_for_surface(surface), path="/")
    response.delete_cookie(LEGACY_ACCESS_COOKIE, path="/")


def extract_access_token(request: Request) -> str | None:
    """Bearer 优先；否则按 surface/路径读对应 Cookie（兼容旧 access_token）。"""
    auth = request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        return token or None

    surface = resolve_surface(request)
    if surface is not None:
        primary = cookie_name_for_surface(surface)
        return request.cookies.get(primary) or request.cookies.get(
            LEGACY_ACCESS_COOKIE
        )

    # /api/auth 等未标明 surface：按端 Cookie 依次尝试（仍兼容 legacy）
    for key in (ADMIN_ACCESS_COOKIE, DOCTOR_ACCESS_COOKIE, LEGACY_ACCESS_COOKIE):
        value = request.cookies.get(key)
        if value:
            return value
    return None
