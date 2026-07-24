"""模拟请求审计：异步落库 + APIRoute 包装（访问控制与第七章顺序）。"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Callable, Coroutine

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from fastapi.routing import APIRoute

from src.core.exceptions import ForbiddenException
from src.core.i18n import translate_message
from src.core.logging import get_logger
from src.db.models import ImpersonationSession
from src.db.models.impersonation_request_log import ImpersonationRequestLog
from src.db.session import async_session_factory
from src.deps import client_ip
from src.modules.impersonation.access import (
    ImpersonationAccessLevel,
    enforce_impersonation_access_level,
    extract_impersonation_context,
    resolve_access_level,
)
from src.modules.impersonation.audit_meta import (
    resolve_audit_sensitive,
    resolve_resource_id,
    resolve_snapshot_loader,
)
from src.modules.impersonation.expiry import expire_if_needed, touch_session_last_active

logger = get_logger(__name__)

# 测试可注入：非 None 时改为同步追加，避免依赖真实 DB / create_task
_test_log_sink: list[dict[str, Any]] | None = None
# 访问控制单测可跳过 DB 会话存活检查
_test_bypass_expiry_check = False


def set_test_log_sink(sink: list[dict[str, Any]] | None) -> None:
    global _test_log_sink
    _test_log_sink = sink


def set_test_bypass_expiry_check(enabled: bool) -> None:
    global _test_bypass_expiry_check
    _test_bypass_expiry_check = enabled


def schedule_impersonation_request_log(payload: dict[str, Any]) -> None:
    """不阻塞主请求：create_task + 独立 AsyncSession。"""
    if _test_log_sink is not None:
        _test_log_sink.append(dict(payload))
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.warning("impersonation_audit_no_loop")
        return
    loop.create_task(_write_impersonation_request_log(payload))


async def _write_impersonation_request_log(payload: dict[str, Any]) -> None:
    try:
        async with async_session_factory() as session:
            session.add(ImpersonationRequestLog(**payload))
            await session.commit()
    except Exception:
        logger.exception(
            "impersonation_request_log_write_failed",
            session_id=payload.get("session_id"),
            path=payload.get("path"),
        )


def _compute_field_diff(
    before: dict[str, Any] | None, after: dict[str, Any] | None
) -> dict[str, Any] | None:
    if before is None and after is None:
        return None
    before = before or {}
    after = after or {}
    keys = set(before) | set(after)
    diff: dict[str, Any] = {}
    for key in sorted(keys):
        old = before.get(key)
        new = after.get(key)
        if old != new:
            diff[key] = {"old": old, "new": new}
    return diff or None


async def _safe_json_body(request: Request) -> dict[str, Any] | None:
    try:
        raw = await request.body()
    except Exception:
        return None
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception:
        return {"_raw_bytes": len(raw)}
    if isinstance(data, dict):
        # 浅脱敏：常见密钥字段打码
        redacted = dict(data)
        for key in list(redacted):
            lk = str(key).lower()
            if any(s in lk for s in ("password", "secret", "token", "authorization")):
                redacted[key] = "***"
        return redacted
    return {"_non_object": True}


def _base_payload(
    *,
    ctx: dict[str, Any],
    request: Request,
    level: ImpersonationAccessLevel,
    http_status: int,
    latency_ms: int,
    decision: str,
    deny_code: str | None = None,
) -> dict[str, Any]:
    return {
        "session_id": int(ctx["session_id"]),
        "operator_id": int(ctx["operator_id"]),
        "doctor_id": int(ctx["doctor_id"]),
        "clinic_id": int(ctx["clinic_id"]),
        "mode": str(ctx["mode"]),
        "path": request.url.path,
        "method": request.method,
        "http_status": http_status,
        "ip": client_ip(request),
        "latency_ms": latency_ms,
        "access_level": level.value,
        "decision": decision,
        "deny_code": deny_code,
        "sensitive": False,
        "resource_type": None,
        "resource_id": None,
        "request_params": None,
        "before_state": None,
        "after_state": None,
        "field_diff": None,
    }


def schedule_touch_last_active(session_id: int) -> None:
    if _test_log_sink is not None:
        # 单测不打 DB；由专门用例覆盖 touch
        return
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return
    loop.create_task(touch_session_last_active(session_id))


class ImpersonationAuditRoute(APIRoute):
    """医生端路由包装：会话超时 → 审计承诺 → 访问控制 → 敏感/diff → 异步落库。"""

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        original = super().get_route_handler()

        async def handler(request: Request) -> Response:
            ctx = extract_impersonation_context(request)
            if ctx is None:
                return await original(request)

            t0 = time.perf_counter()
            endpoint = self.endpoint
            level = resolve_access_level(endpoint)
            session_id = int(ctx["session_id"])

            # 懒惰超时：绝对 / proxy 空闲
            if _test_bypass_expiry_check:
                live = object()  # 非 None 即可
            else:
                try:
                    async with async_session_factory() as db:
                        row = await db.get(ImpersonationSession, session_id)
                        live = await expire_if_needed(db, row)
                        await db.commit()
                except Exception:
                    logger.exception(
                        "impersonation_session_expiry_check_failed",
                        session_id=session_id,
                    )
                    live = None

            if live is None:
                latency_ms = int((time.perf_counter() - t0) * 1000)
                schedule_impersonation_request_log(
                    _base_payload(
                        ctx=ctx,
                        request=request,
                        level=level,
                        http_status=401,
                        latency_ms=latency_ms,
                        decision="denied",
                        deny_code="IMPERSONATION_SESSION_EXPIRED",
                    )
                )
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": {
                            "code": "IMPERSONATION_SESSION_EXPIRED",
                            "message": translate_message("模拟会话已超时失效"),
                        }
                    },
                )

            # 步骤2 语义：拒绝前已进入必记路径；status/latency 在结束后一次写入
            try:
                enforce_impersonation_access_level(
                    mode=str(ctx["mode"]), level=level
                )
            except ForbiddenException as exc:
                latency_ms = int((time.perf_counter() - t0) * 1000)
                schedule_impersonation_request_log(
                    _base_payload(
                        ctx=ctx,
                        request=request,
                        level=level,
                        http_status=403,
                        latency_ms=latency_ms,
                        decision="denied",
                        deny_code=exc.code,
                    )
                )
                return JSONResponse(
                    status_code=exc.status_code,
                    content={
                        "error": {
                            "code": exc.code,
                            "message": translate_message(exc.message, params=exc.params),
                        }
                    },
                )

            # 放行成功：刷新空闲时钟
            schedule_touch_last_active(session_id)

            request_params = None
            before_state = None
            if level is ImpersonationAccessLevel.MUTATING:
                request_params = await _safe_json_body(request)
                loader = resolve_snapshot_loader(endpoint)
                if loader is not None:
                    try:
                        before_state = await loader(request)
                    except Exception:
                        logger.warning(
                            "impersonation_before_snapshot_failed",
                            path=request.url.path,
                        )

            response = await original(request)
            latency_ms = int((time.perf_counter() - t0) * 1000)
            status_code = int(getattr(response, "status_code", 200) or 200)

            payload = _base_payload(
                ctx=ctx,
                request=request,
                level=level,
                http_status=status_code,
                latency_ms=latency_ms,
                decision="allowed",
            )

            sensitive_meta = resolve_audit_sensitive(endpoint)
            if sensitive_meta is not None:
                payload["sensitive"] = True
                payload["resource_type"] = sensitive_meta.resource
                payload["resource_id"] = resolve_resource_id(
                    request, sensitive_meta.id_param
                )

            if level is ImpersonationAccessLevel.MUTATING:
                payload["request_params"] = request_params
                after_state = None
                loader = resolve_snapshot_loader(endpoint)
                if loader is not None:
                    try:
                        after_state = await loader(request)
                    except Exception:
                        logger.warning(
                            "impersonation_after_snapshot_failed",
                            path=request.url.path,
                        )
                payload["before_state"] = before_state
                payload["after_state"] = after_state
                payload["field_diff"] = _compute_field_diff(before_state, after_state)

            schedule_impersonation_request_log(payload)
            return response

        return handler
