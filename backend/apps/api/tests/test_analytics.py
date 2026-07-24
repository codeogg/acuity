"""运营端 analytics 聚合单元测试。"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.modules.analytics import service as analytics_service
from src.modules.analytics.schemas import AnalyticsOverview, VerificationReport


class _Result:
    def __init__(self, value):
        self._value = value

    def scalar_one(self):
        return self._value

    def all(self):
        return self._value


@pytest.mark.asyncio
async def test_get_overview_counts(monkeypatch: pytest.MonkeyPatch) -> None:
    counts = {"processed_today": 2, "processed_7d": 5, "pass": 3, "fail": 1}
    call_n = {"i": 0}

    async def fake_count(db, **kwargs):  # noqa: ANN001
        call_n["i"] += 1
        statuses = kwargs.get("statuses")
        since = kwargs.get("since")
        until = kwargs.get("until")
        if statuses == analytics_service._PROCESSED_STATUSES and until is not None:
            return counts["processed_today"]
        if statuses == analytics_service._PROCESSED_STATUSES:
            return counts["processed_7d"]
        if statuses == analytics_service._VERIFY_PASS_STATUSES:
            return counts["pass"]
        if statuses == ("CANCELLED",):
            return counts["fail"]
        return 0

    monkeypatch.setattr(analytics_service, "_count_claims", fake_count)
    out = await analytics_service.get_overview(MagicMock())
    assert isinstance(out, AnalyticsOverview)
    assert out.forms_processed_today == 2
    assert out.forms_processed_7d == 5
    assert out.verify_pass_7d == 3
    assert out.verify_fail_7d == 1
    assert out.window_days == 7


@pytest.mark.asyncio
async def test_activation_funnel() -> None:
    db = MagicMock()
    db.execute = AsyncMock(
        return_value=_Result(
            [
                ("provisioning", 2),
                ("onboarding", 1),
                ("active", 4),
                (None, 1),  # treated as provisioning via str(None) -> "None"? 
            ]
        )
    )
    # Fix: None status becomes "None" string - our code uses str(status or PROVISIONING)
    # so None -> provisioning. Good. But then provisioning = 2+1=3
    funnel = await analytics_service.get_activation_funnel(db)
    assert funnel.onboarding == 1
    assert funnel.active == 4
    assert funnel.provisioning == 3


@pytest.mark.asyncio
async def test_verification_report(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_count(db, **kwargs):  # noqa: ANN001
        if kwargs.get("statuses") == analytics_service._VERIFY_PASS_STATUSES:
            return 10
        return 2

    monkeypatch.setattr(analytics_service, "_count_claims", fake_count)
    report = await analytics_service.get_verification_report(MagicMock(), window_days=30)
    assert isinstance(report, VerificationReport)
    assert report.pass_ == 10
    assert report.fail == 2
    dumped = report.model_dump(by_alias=True)
    assert dumped["pass"] == 10


@pytest.mark.asyncio
async def test_confidences_from_ai_raw() -> None:
    confs = analytics_service._confidences_from_ai_raw(
        {
            "a": {"value": "x", "confidence": 0.9},
            "b": {"value": "y", "confidence": 0.7},
            "c": "skip",
        }
    )
    assert confs == [0.9, 0.7]
