from fastapi import APIRouter, Query

from src.deps import AdminDep, DbSession
from src.modules.analytics import service
from src.modules.analytics.schemas import (
    ActivationFunnel,
    AnalyticsExportRequest,
    AnalyticsExportResult,
    AnalyticsOverview,
    QualityReport,
    UsagePoint,
    VerificationReport,
)

router = APIRouter(prefix="/api/admin/analytics", tags=["admin:analytics"])


@router.get("/overview", response_model=AnalyticsOverview)
async def get_analytics_overview(db: DbSession, _: AdminDep) -> AnalyticsOverview:
    return await service.get_overview(db)


@router.get("/usage", response_model=list[UsagePoint])
async def get_usage_series(
    db: DbSession,
    _: AdminDep,
    range_days: int = Query(30, ge=1, le=90),
    clinic_id: int | None = None,
    doctor_id: int | None = None,
) -> list[UsagePoint]:
    return await service.get_usage_series(
        db,
        range_days=range_days,
        clinic_id=clinic_id,
        doctor_id=doctor_id,
    )


@router.get("/funnel", response_model=ActivationFunnel)
async def get_activation_funnel(db: DbSession, _: AdminDep) -> ActivationFunnel:
    return await service.get_activation_funnel(db)


@router.get("/verification", response_model=VerificationReport)
async def get_verification_report(db: DbSession, _: AdminDep) -> VerificationReport:
    return await service.get_verification_report(db)


@router.get("/quality", response_model=QualityReport)
async def get_quality_report(db: DbSession, _: AdminDep) -> QualityReport:
    return await service.get_quality_report(db)


@router.post("/export", response_model=AnalyticsExportResult)
async def export_analytics(
    body: AnalyticsExportRequest,
    db: DbSession,
    admin: AdminDep,
) -> AnalyticsExportResult:
    return await service.export_analytics(db, body, operator_id=admin.id)
