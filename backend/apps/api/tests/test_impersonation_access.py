"""ImpersonationAccess 切面：FORBIDDEN / MUTATING / 未标注默认 MUTATING。"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient

from src.core.exceptions import register_exception_handlers
from src.core.security import create_access_token
from src.modules.impersonation.access import ImpersonationAccess, ImpersonationAccessLevel
from src.modules.impersonation.route import (
    ImpersonationAuditRoute,
    set_test_bypass_expiry_check,
)
from src.modules.impersonation.tokens import create_impersonation_access_token


def _build_app() -> FastAPI:
    app = FastAPI()
    register_exception_handlers(app)
    router = APIRouter(
        prefix="/api/doctor/test-impersonation-access",
        route_class=ImpersonationAuditRoute,
    )

    @router.get("/forbidden")
    @ImpersonationAccess(ImpersonationAccessLevel.FORBIDDEN)
    async def forbidden_endpoint() -> dict[str, bool]:
        return {"ok": True}

    @router.get("/mutating")
    @ImpersonationAccess(ImpersonationAccessLevel.MUTATING)
    async def mutating_endpoint() -> dict[str, bool]:
        return {"ok": True}

    @router.get("/unmarked")
    async def unmarked_endpoint() -> dict[str, bool]:
        """完全未标注：必须按 MUTATING（检视拒绝）。"""
        return {"ok": True}

    app.include_router(router)
    return app


def _impersonation_token(*, mode: str) -> str:
    return create_impersonation_access_token(
        session_id=1,
        operator_id=9,
        doctor_id=2,
        clinic_id=3,
        mode=mode,  # type: ignore[arg-type]
        expire_at=datetime.now(UTC) + timedelta(hours=1),
    )


@pytest.fixture(autouse=True)
def _bypass_expiry() -> None:
    set_test_bypass_expiry_check(True)
    yield
    set_test_bypass_expiry_check(False)


@pytest.fixture
def app() -> FastAPI:
    return _build_app()


@pytest.mark.asyncio
async def test_forbidden_denied_in_view_and_proxy(app: FastAPI) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        for mode in ("view", "proxy"):
            token = _impersonation_token(mode=mode)
            resp = await client.get(
                "/api/doctor/test-impersonation-access/forbidden",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code == 403, mode
            body = resp.json()
            assert body["error"]["code"] == "IMPERSONATION_FORBIDDEN"


@pytest.mark.asyncio
async def test_mutating_view_denied_proxy_allowed(app: FastAPI) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        view_token = _impersonation_token(mode="view")
        view_resp = await client.get(
            "/api/doctor/test-impersonation-access/mutating",
            headers={"Authorization": f"Bearer {view_token}"},
        )
        assert view_resp.status_code == 403
        assert view_resp.json()["error"]["code"] == "IMPERSONATION_READ_ONLY"

        proxy_token = _impersonation_token(mode="proxy")
        proxy_resp = await client.get(
            "/api/doctor/test-impersonation-access/mutating",
            headers={"Authorization": f"Bearer {proxy_token}"},
        )
        assert proxy_resp.status_code == 200
        assert proxy_resp.json() == {"ok": True}


@pytest.mark.asyncio
async def test_unmarked_denied_in_view_default_mutating(app: FastAPI) -> None:
    """未标注接口在检视模式下必须被拒绝（默认 MUTATING 安全底线）。"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        token = _impersonation_token(mode="view")
        resp = await client.get(
            "/api/doctor/test-impersonation-access/unmarked",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 403
        assert resp.json()["error"]["code"] == "IMPERSONATION_READ_ONLY"

        normal = create_access_token(user_id=2, role="DOCTOR", clinic_id=3)
        ok = await client.get(
            "/api/doctor/test-impersonation-access/unmarked",
            headers={"Authorization": f"Bearer {normal}"},
        )
        assert ok.status_code == 200
        assert ok.json() == {"ok": True}
