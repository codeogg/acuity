"""导览步骤：批量初始化 / 单步完成 / 进度 / 确认启用。"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.core.exceptions import NotFoundException, ValidationException
from src.modules.clinics import onboarding as onboarding_mod
from src.modules.clinics.lifecycle import mark_active
from src.modules.clinics.onboarding import STEP_COMPLETED, STEP_PENDING


def test_step_status_constants() -> None:
    assert STEP_PENDING == "pending"
    assert STEP_COMPLETED == "completed"


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalars(self):
        return self

    def all(self):
        return self._value

    def scalar_one_or_none(self):
        return self._value[0] if isinstance(self._value, list) and self._value else self._value

    def scalar_one(self):
        return self.scalar_one_or_none()


@pytest.mark.asyncio
async def test_mark_step_completed_updates_in_place() -> None:
    tmpl = SimpleNamespace(step_code="confirm_setup", step_name="確認設定", step_name_en="Confirm")
    row = SimpleNamespace(
        clinic_id=3,
        step_code="confirm_setup",
        status=STEP_PENDING,
        completed_at=None,
        completed_by=None,
    )
    calls: list[str] = []

    async def fake_execute(stmt):  # noqa: ANN001
        sql = str(stmt)
        calls.append(sql)
        if "onboarding_step_template" in sql.lower() or "OnboardingStepTemplate" in sql:
            return _ScalarResult(tmpl)
        return _ScalarResult(row)

    db = MagicMock()
    db.execute = AsyncMock(side_effect=fake_execute)
    db.flush = AsyncMock()

    out = await onboarding_mod.mark_step_completed(db, 3, "confirm_setup", completed_by=1)
    assert out is row
    assert row.status == STEP_COMPLETED
    assert row.completed_at is not None
    assert row.completed_by == 1
    db.flush.assert_awaited()


@pytest.mark.asyncio
async def test_mark_step_completed_idempotent() -> None:
    tmpl = SimpleNamespace(step_code="confirm_setup")
    row = SimpleNamespace(
        status=STEP_COMPLETED,
        completed_at="already",
        completed_by=9,
    )

    async def fake_execute(stmt):  # noqa: ANN001
        sql = str(stmt)
        if "OnboardingStepTemplate" in sql or "onboarding_step_template" in sql.lower():
            return _ScalarResult(tmpl)
        return _ScalarResult(row)

    db = MagicMock()
    db.execute = AsyncMock(side_effect=fake_execute)
    db.flush = AsyncMock()

    out = await onboarding_mod.mark_step_completed(db, 3, "confirm_setup")
    assert out.completed_at == "already"
    db.flush.assert_not_awaited()


@pytest.mark.asyncio
async def test_mark_step_completed_missing_row() -> None:
    tmpl = SimpleNamespace(step_code="confirm_setup")

    async def fake_execute(stmt):  # noqa: ANN001
        sql = str(stmt)
        if "OnboardingStepTemplate" in sql or "onboarding_step_template" in sql.lower():
            return _ScalarResult(tmpl)
        return _ScalarResult(None)

    db = MagicMock()
    db.execute = AsyncMock(side_effect=fake_execute)

    with pytest.raises(NotFoundException):
        await onboarding_mod.mark_step_completed(db, 3, "confirm_setup")


@pytest.mark.asyncio
async def test_get_onboarding_progress_label(monkeypatch: pytest.MonkeyPatch) -> None:
    templates = [
        SimpleNamespace(
            step_code=f"s{i}",
            step_name=f"步骤{i}",
            step_name_en=f"Step {i}",
            sort_order=i,
        )
        for i in range(1, 9)
    ]
    rows = [
        SimpleNamespace(step_code="s1", status=STEP_COMPLETED, completed_at=None),
        SimpleNamespace(step_code="s2", status=STEP_COMPLETED, completed_at=None),
        SimpleNamespace(step_code="s3", status=STEP_PENDING, completed_at=None),
    ]
    clinic = SimpleNamespace(lifecycle_status="onboarding")

    async def fake_execute(stmt):  # noqa: ANN001
        sql = str(stmt)
        if "OnboardingStepTemplate" in sql or "onboarding_step_template" in sql.lower():
            return _ScalarResult(templates)
        return _ScalarResult(rows)

    db = MagicMock()
    db.get = AsyncMock(return_value=clinic)
    db.execute = AsyncMock(side_effect=fake_execute)

    progress = await onboarding_mod.get_onboarding_progress(db, 3)
    assert progress["progress_label"] == "2/8"
    assert progress["completed"] == 2
    assert progress["total"] == 8
    assert progress["all_completed"] is False
    assert progress["can_confirm_activate"] is False
    assert progress["current_step_code"] == "s3"


@pytest.mark.asyncio
async def test_mark_active_requires_all_steps(monkeypatch: pytest.MonkeyPatch) -> None:
    clinic = SimpleNamespace(id=3, clinic_code="C3", lifecycle_status="onboarding")

    async def fake_progress(_db, _id):  # noqa: ANN001
        return {"all_completed": False, "progress_label": "6/8"}

    monkeypatch.setattr(
        "src.modules.clinics.onboarding.get_onboarding_progress",
        fake_progress,
    )

    db = MagicMock()
    with pytest.raises(ValidationException, match="6/8"):
        await mark_active(db, clinic, operator_id=1)


@pytest.mark.asyncio
async def test_mark_active_success(monkeypatch: pytest.MonkeyPatch) -> None:
    clinic = SimpleNamespace(id=3, clinic_code="C3", lifecycle_status="onboarding")
    audit = AsyncMock()

    async def fake_progress(_db, _id):  # noqa: ANN001
        return {"all_completed": True, "progress_label": "8/8"}

    monkeypatch.setattr(
        "src.modules.clinics.onboarding.get_onboarding_progress",
        fake_progress,
    )
    monkeypatch.setattr("src.modules.audit.service.log_audit", audit)

    db = MagicMock()
    db.flush = AsyncMock()
    out = await mark_active(db, clinic, operator_id=7)
    assert out.lifecycle_status == "active"
    audit.assert_awaited()
    assert audit.await_args.kwargs["action_type"] == "clinic_activate"
