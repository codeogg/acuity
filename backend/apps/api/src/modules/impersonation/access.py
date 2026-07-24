"""模拟会话访问控制（设计文档第六章）——安全边界。

未标注接口一律按 MUTATING 处理（检视模式拒绝）。不可改为 READ_ONLY。
"""
from __future__ import annotations

from collections.abc import Callable
from enum import Enum
from typing import Any, TypeVar

from fastapi import Depends, Request
from jose import JWTError, jwt

from src.config import settings
from src.core.exceptions import ForbiddenException
from src.core.session_cookies import extract_access_token
from src.modules.impersonation.tokens import IMPERSONATION_SESSION_TYP

F = TypeVar("F", bound=Callable[..., Any])

_ACCESS_ATTR = "__impersonation_access__"


class ImpersonationAccessLevel(str, Enum):
    READ_ONLY = "READ_ONLY"
    MUTATING = "MUTATING"
    FORBIDDEN = "FORBIDDEN"


# 安全底线：未标注 = MUTATING。禁止改成 READ_ONLY。
DEFAULT_IMPERSONATION_ACCESS = ImpersonationAccessLevel.MUTATING


def ImpersonationAccess(
    level: ImpersonationAccessLevel = ImpersonationAccessLevel.MUTATING,
) -> Callable[[F], F]:
    """等价于 Java @ImpersonationAccess(level)。挂到 endpoint 函数上供切面读取。"""

    def decorator(fn: F) -> F:
        setattr(fn, _ACCESS_ATTR, level)
        return fn

    return decorator


def resolve_access_level(endpoint: Any) -> ImpersonationAccessLevel:
    """解析接口访问等级；完全未标注 → MUTATING。"""
    if endpoint is None:
        return DEFAULT_IMPERSONATION_ACCESS

    seen: set[int] = set()
    current: Any = endpoint
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        level = getattr(current, _ACCESS_ATTR, None)
        if isinstance(level, ImpersonationAccessLevel):
            return level
        current = getattr(current, "__wrapped__", None)

    return DEFAULT_IMPERSONATION_ACCESS


def extract_impersonation_context(request: Request) -> dict[str, Any] | None:
    """从业务 JWT 解出 impersonation；普通登录 JWT 或无 token → None（切面放行）。"""
    token = extract_access_token(request)
    if not token:
        return None
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM]
        )
    except JWTError:
        return None
    if payload.get("typ") != IMPERSONATION_SESSION_TYP:
        return None
    ctx = payload.get("impersonation")
    if not isinstance(ctx, dict):
        return None
    mode = ctx.get("mode")
    if mode not in ("view", "proxy"):
        return None
    return ctx


def enforce_impersonation_access_level(
    *,
    mode: str,
    level: ImpersonationAccessLevel,
) -> None:
    """纯判断逻辑（便于单测）；违规则抛 ForbiddenException。"""
    if level is ImpersonationAccessLevel.FORBIDDEN:
        raise ForbiddenException(
            "模拟会话中禁止此操作",
            code="IMPERSONATION_FORBIDDEN",
        )
    if level is ImpersonationAccessLevel.MUTATING:
        if mode == "view":
            raise ForbiddenException(
                "检视模式下不可执行写操作",
                code="IMPERSONATION_READ_ONLY",
            )
        if mode == "proxy":
            return
        raise ForbiddenException(
            "检视模式下不可执行写操作",
            code="IMPERSONATION_READ_ONLY",
        )
    if level is ImpersonationAccessLevel.READ_ONLY:
        return
    # 未知等级：保守按 MUTATING
    if mode == "view":
        raise ForbiddenException(
            "检视模式下不可执行写操作",
            code="IMPERSONATION_READ_ONLY",
        )


async def enforce_impersonation_access(request: Request) -> None:
    """FastAPI 依赖切面：无模拟上下文直接放行；有则按注解（默认 MUTATING）裁决。"""
    ctx = extract_impersonation_context(request)
    if ctx is None:
        return

    endpoint = request.scope.get("endpoint")
    level = resolve_access_level(endpoint)
    enforce_impersonation_access_level(mode=str(ctx["mode"]), level=level)


# 挂到 /api/doctor/** 路由
ImpersonationAccessDep = Depends(enforce_impersonation_access)
