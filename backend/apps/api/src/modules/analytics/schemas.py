"""运营端分析聚合 DTO。"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AnalyticsOverview(BaseModel):
    forms_processed_today: int
    forms_processed_7d: int
    verify_pass_7d: int
    verify_fail_7d: int
    window_days: int = 7


class UsagePoint(BaseModel):
    date: date
    count: int


class ActivationFunnel(BaseModel):
    provisioning: int
    onboarding: int
    active: int


class VerificationReport(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    pass_: int = Field(alias="pass")
    fail: int
    window_days: int = 30


class QualityTrendPoint(BaseModel):
    date: date
    avg_confidence: float
    correction_rate: float


class QualityReport(BaseModel):
    avg_confidence: float
    correction_rate: float
    trend: list[QualityTrendPoint]


class AnalyticsExportRequest(BaseModel):
    report: Literal["usage", "funnel", "verification", "quality"]
    range_days: int | None = None


class AnalyticsExportResult(BaseModel):
    export_url: str
    logged_event_id: str
