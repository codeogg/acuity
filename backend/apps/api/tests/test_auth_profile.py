"""Auth profile: get_me / update_profile."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.core.exceptions import ValidationException
from src.modules.auth import service as auth_service


@pytest.mark.asyncio
async def test_update_profile_admin_real_name() -> None:
    admin = SimpleNamespace(id=1, username="admin", real_name="Old")
    user = SimpleNamespace(id=1, role="SUPER_ADMIN", clinic_id=None)
    db = MagicMock()
    db.get = AsyncMock(return_value=admin)
    db.flush = AsyncMock()

    out = await auth_service.update_profile(db, user, display_name="  New Name  ")
    assert admin.real_name == "New Name"
    assert out.display_name == "New Name"
    assert out.username == "admin"
    db.flush.assert_awaited()


@pytest.mark.asyncio
async def test_update_profile_rejects_blank() -> None:
    user = SimpleNamespace(id=1, role="OPERATOR", clinic_id=None)
    db = MagicMock()
    with pytest.raises(ValidationException):
        await auth_service.update_profile(db, user, display_name="   ")


@pytest.mark.asyncio
async def test_get_me_includes_username() -> None:
    admin = SimpleNamespace(id=9, username="ops", real_name="Ops User")
    user = SimpleNamespace(id=9, role="OPERATOR", clinic_id=None)
    db = MagicMock()
    db.get = AsyncMock(return_value=admin)
    me = await auth_service.get_me(db, user)
    assert me.user_id == 9
    assert me.username == "ops"
    assert me.display_name == "Ops User"
