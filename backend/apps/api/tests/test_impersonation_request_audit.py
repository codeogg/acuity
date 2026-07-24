"""模拟请求审计：拒绝必记、敏感追加、MUTATING diff（可选 loader）。"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi import APIRouter, FastAPI, Request
from httpx import ASGITransport, AsyncClient

from src.core.exceptions import register_exception_handlers
from src.modules.impersonation.access import ImpersonationAccess, ImpersonationAccessLevel
from src.modules.impersonation.audit_meta import AuditSensitive, audit_entity_snapshot
from src.modules.impersonation.route import (
    ImpersonationAuditRoute,
    set_test_bypass_expiry_check,
    set_test_log_sink,
)
from src.modules.impersonation.tokens import create_impersonation_access_token

_STORE: dict[str, Any] = {"value": "old"}


async def _snapshot_loader(request: Request) -> dict[str, Any]:
    return {"value": _STORE["value"]}


def _build_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    router = APIRouter(
        prefix="/api/doctor/test-impersonation-audit",
        route_class=ImpersonationAuditRoute,
    )

    @router.get("/forbidden")
    @ImpersonationAccess(ImpersonationAccessLevel.FORBIDDEN)
    async def forbidden_endpoint() -> dict[str, bool]:
        return {"ok": True}

    @router.get("/sensitive/{claim_id}")
    @ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
    @AuditSensitive(resource="claim", id_param="claim_id")
    async def sensitive_endpoint(claim_id: int) -> dict[str, int]:
        return {"claim_id": claim_id}

    @router.post("/mutating-entity")
    @ImpersonationAccess(ImpersonationAccessLevel.MUTATING)
    @audit_entity_snapshot(_snapshot_loader)
    async def mutating_with_loader(request: Request) -> dict[str, str]:
        body = await request.json()
        _STORE["value"] = body.get("value", _STORE["value"])
        return {"value": _STORE["value"]}

    app.include_router(router)
    return app


def _token(*, mode: str) -> str:
    return create_impersonation_access_token(
        session_id=42,
        operator_id=7,
        doctor_id=2,
        clinic_id=3,
        mode=mode,  # type: ignore[arg-type]
        expire_at=datetime.now(UTC) + timedelta(hours=1),
    )


@pytest.fixture(autouse=True)
def _bypass_expiry_and_audit_sink():
    set_test_bypass_expiry_check(True)
    sink: list[dict[str, Any]] = []
    set_test_log_sink(sink)
    yield sink
    set_test_log_sink(None)
    set_test_bypass_expiry_check(False)


@pytest.fixture
def app() -> FastAPI:
    return _build_app()


@pytest.mark.asyncio
async def test_denied_request_still_writes_base_log(
    app: FastAPI, _bypass_expiry_and_audit_sink: list[dict[str, Any]]
) -> None:
    _audit_sink = _bypass_expiry_and_audit_sink
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/doctor/test-impersonation-audit/forbidden",
            headers={"Authorization": f"Bearer {_token(mode='view')}"},
        )
    assert resp.status_code == 403
    assert len(_audit_sink) == 1
    row = _audit_sink[0]
    assert row["decision"] == "denied"
    assert row["http_status"] == 403
    assert row["deny_code"] == "IMPERSONATION_FORBIDDEN"
    assert row["session_id"] == 42
    assert row["operator_id"] == 7
    assert row["doctor_id"] == 2
    assert row["mode"] == "view"
    assert row["method"] == "GET"
    assert row["path"].endswith("/forbidden")
    assert row["field_diff"] is None
    assert row["sensitive"] is False


@pytest.mark.asyncio
async def test_sensitive_appended_when_allowed(
    app: FastAPI, _bypass_expiry_and_audit_sink: list[dict[str, Any]]
) -> None:
    _audit_sink = _bypass_expiry_and_audit_sink
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get(
            "/api/doctor/test-impersonation-audit/sensitive/99",
            headers={"Authorization": f"Bearer {_token(mode='view')}"},
        )
    assert resp.status_code == 200
    assert len(_audit_sink) == 1
    row = _audit_sink[0]
    assert row["decision"] == "allowed"
    assert row["sensitive"] is True
    assert row["resource_type"] == "claim"
    assert row["resource_id"] == "99"


@pytest.mark.asyncio
async def test_mutating_diff_with_optional_loader(
    app: FastAPI, _bypass_expiry_and_audit_sink: list[dict[str, Any]]
) -> None:
    _audit_sink = _bypass_expiry_and_audit_sink
    _STORE["value"] = "old"
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(
            "/api/doctor/test-impersonation-audit/mutating-entity",
            headers={"Authorization": f"Bearer {_token(mode='proxy')}"},
            json={"value": "new"},
        )
    assert resp.status_code == 200
    assert len(_audit_sink) == 1
    row = _audit_sink[0]
    assert row["decision"] == "allowed"
    assert row["access_level"] == "MUTATING"
    assert row["request_params"] == {"value": "new"}
    assert row["before_state"] == {"value": "old"}
    assert row["after_state"] == {"value": "new"}
    assert row["field_diff"] == {"value": {"old": "old", "new": "new"}}
