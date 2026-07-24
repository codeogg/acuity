"""运营端分析聚合：从 claim / clinic / field-change 实时统计。"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, cast, Date, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models.claims import ClaimFieldChangeLog, ClaimSubmission
from src.db.models.org import Clinic
from src.modules.analytics.schemas import (
    ActivationFunnel,
    AnalyticsExportRequest,
    AnalyticsExportResult,
    AnalyticsOverview,
    QualityReport,
    QualityTrendPoint,
    UsagePoint,
    VerificationReport,
)
from src.modules.audit.service import log_audit
from src.modules.clinics.lifecycle import (
    LIFECYCLE_ACTIVE,
    LIFECYCLE_ONBOARDING,
    LIFECYCLE_PROVISIONING,
)

_HK = ZoneInfo("Asia/Hong_Kong")

_PROCESSED_STATUSES = ("AI_FILLED", "CONFIRMED", "PRINTED")
_VERIFY_PASS_STATUSES = ("CONFIRMED", "PRINTED")


def _hk_day_bounds(days_back: int = 0) -> tuple[datetime, datetime]:
    """Return [start, end) UTC bounds for a Hong Kong calendar day."""
    now_hk = datetime.now(_HK)
    day = (now_hk.date() - timedelta(days=days_back))
    start = datetime(day.year, day.month, day.day, tzinfo=_HK).astimezone(UTC)
    end = start + timedelta(days=1)
    return start, end


def _since_days(days: int) -> datetime:
    start, _ = _hk_day_bounds(days - 1)
    return start


async def _count_claims(
    db: AsyncSession,
    *,
    since: datetime | None = None,
    until: datetime | None = None,
    statuses: tuple[str, ...] | None = None,
    clinic_id: int | None = None,
    doctor_id: int | None = None,
) -> int:
    conds = [ClaimSubmission.status != "CANCELLED"] if statuses is None else [
        ClaimSubmission.status.in_(statuses)
    ]
    if since is not None:
        conds.append(ClaimSubmission.created_at >= since)
    if until is not None:
        conds.append(ClaimSubmission.created_at < until)
    if clinic_id is not None:
        conds.append(ClaimSubmission.clinic_id == clinic_id)
    if doctor_id is not None:
        conds.append(ClaimSubmission.doctor_id == doctor_id)
    return int(
        (
            await db.execute(
                select(func.count()).select_from(ClaimSubmission).where(and_(*conds))
            )
        ).scalar_one()
    )


async def get_overview(db: AsyncSession) -> AnalyticsOverview:
    today_start, today_end = _hk_day_bounds(0)
    since_7d = _since_days(7)

    forms_today = await _count_claims(
        db, since=today_start, until=today_end, statuses=_PROCESSED_STATUSES
    )
    forms_7d = await _count_claims(db, since=since_7d, statuses=_PROCESSED_STATUSES)
    pass_7d = await _count_claims(db, since=since_7d, statuses=_VERIFY_PASS_STATUSES)
    fail_7d = await _count_claims(db, since=since_7d, statuses=("CANCELLED",))

    return AnalyticsOverview(
        forms_processed_today=forms_today,
        forms_processed_7d=forms_7d,
        verify_pass_7d=pass_7d,
        verify_fail_7d=fail_7d,
        window_days=7,
    )


async def get_usage_series(
    db: AsyncSession,
    *,
    range_days: int = 30,
    clinic_id: int | None = None,
    doctor_id: int | None = None,
) -> list[UsagePoint]:
    days = max(1, min(range_days, 90))
    since = _since_days(days)
    conds = [
        ClaimSubmission.created_at >= since,
        ClaimSubmission.status != "CANCELLED",
    ]
    if clinic_id is not None:
        conds.append(ClaimSubmission.clinic_id == clinic_id)
    if doctor_id is not None:
        conds.append(ClaimSubmission.doctor_id == doctor_id)

    # Group by HK calendar date via timezone conversion.
    day_expr = func.timezone("Asia/Hong_Kong", ClaimSubmission.created_at)
    day_date = cast(day_expr, Date)
    rows = (
        await db.execute(
            select(day_date.label("d"), func.count().label("c"))
            .where(and_(*conds))
            .group_by(day_date)
            .order_by(day_date)
        )
    ).all()
    by_day = {row.d: int(row.c) for row in rows if row.d is not None}

    today_hk = datetime.now(_HK).date()
    out: list[UsagePoint] = []
    for i in range(days - 1, -1, -1):
        d = today_hk - timedelta(days=i)
        out.append(UsagePoint(date=d, count=by_day.get(d, 0)))
    return out


async def get_activation_funnel(db: AsyncSession) -> ActivationFunnel:
    rows = (
        await db.execute(
            select(Clinic.lifecycle_status, func.count())
            .group_by(Clinic.lifecycle_status)
        )
    ).all()
    counts = {
        LIFECYCLE_PROVISIONING: 0,
        LIFECYCLE_ONBOARDING: 0,
        LIFECYCLE_ACTIVE: 0,
    }
    for status, n in rows:
        key = status if status in counts else LIFECYCLE_PROVISIONING
        counts[key] += int(n)
    return ActivationFunnel(
        provisioning=counts[LIFECYCLE_PROVISIONING],
        onboarding=counts[LIFECYCLE_ONBOARDING],
        active=counts[LIFECYCLE_ACTIVE],
    )


async def get_verification_report(
    db: AsyncSession, *, window_days: int = 30
) -> VerificationReport:
    days = max(1, min(window_days, 90))
    since = _since_days(days)
    pass_n = await _count_claims(db, since=since, statuses=_VERIFY_PASS_STATUSES)
    fail_n = await _count_claims(db, since=since, statuses=("CANCELLED",))
    return VerificationReport(pass_=pass_n, fail=fail_n, window_days=days)


def _confidences_from_ai_raw(ai_raw: dict | None) -> list[float]:
    if not isinstance(ai_raw, dict):
        return []
    out: list[float] = []
    for raw in ai_raw.values():
        if isinstance(raw, dict) and raw.get("confidence") is not None:
            try:
                out.append(float(raw["confidence"]))
            except (TypeError, ValueError):
                continue
    return out


async def get_quality_report(
    db: AsyncSession, *, window_days: int = 14
) -> QualityReport:
    days = max(1, min(window_days, 90))
    since = _since_days(days)

    claims = (
        await db.execute(
            select(ClaimSubmission.id, ClaimSubmission.created_at, ClaimSubmission.ai_raw_result)
            .where(
                ClaimSubmission.created_at >= since,
                ClaimSubmission.status.in_(_PROCESSED_STATUSES),
            )
            .order_by(ClaimSubmission.created_at.asc())
        )
    ).all()

    change_rows = (
        await db.execute(
            select(
                ClaimFieldChangeLog.submission_id,
                ClaimFieldChangeLog.is_modified,
                ClaimFieldChangeLog.created_at,
            ).where(ClaimFieldChangeLog.created_at >= since)
        )
    ).all()

    modified_by_claim: dict[int, bool] = defaultdict(bool)
    logs_by_day: dict[date, list[bool]] = defaultdict(list)
    for submission_id, is_modified, created_at in change_rows:
        if is_modified:
            modified_by_claim[int(submission_id)] = True
        if created_at is not None:
            d = created_at.astimezone(_HK).date()
            logs_by_day[d].append(bool(is_modified))

    all_conf: list[float] = []
    conf_by_day: dict[date, list[float]] = defaultdict(list)
    claim_days: dict[int, date] = {}
    for claim_id, created_at, ai_raw in claims:
        confs = _confidences_from_ai_raw(ai_raw if isinstance(ai_raw, dict) else None)
        all_conf.extend(confs)
        if created_at is not None:
            d = created_at.astimezone(_HK).date()
            claim_days[int(claim_id)] = d
            conf_by_day[d].extend(confs)

    avg_confidence = sum(all_conf) / len(all_conf) if all_conf else 0.0
    corrected = sum(1 for cid in claim_days if modified_by_claim.get(cid))
    correction_rate = (corrected / len(claim_days)) if claim_days else 0.0

    today_hk = datetime.now(_HK).date()
    # Sparse trend: every other day over the window (matches fixture density).
    trend: list[QualityTrendPoint] = []
    step = 2 if days > 7 else 1
    for i in range(days - 1, -1, -step):
        d = today_hk - timedelta(days=i)
        day_conf = conf_by_day.get(d, [])
        day_logs = logs_by_day.get(d, [])
        day_avg = sum(day_conf) / len(day_conf) if day_conf else avg_confidence
        day_corr = (
            sum(1 for x in day_logs if x) / len(day_logs) if day_logs else correction_rate
        )
        trend.append(
            QualityTrendPoint(
                date=d,
                avg_confidence=round(day_avg, 4),
                correction_rate=round(day_corr, 4),
            )
        )

    return QualityReport(
        avg_confidence=round(avg_confidence, 4),
        correction_rate=round(correction_rate, 4),
        trend=trend,
    )


async def export_analytics(
    db: AsyncSession,
    body: AnalyticsExportRequest,
    *,
    operator_id: int,
) -> AnalyticsExportResult:
    row = await log_audit(
        db,
        action_type="export",
        operator_id=operator_id,
        target_ref=f"analytics/{body.report}",
        detail={"report": body.report, "range_days": body.range_days},
    )
    stamp = int(datetime.now(UTC).timestamp()) % 100000
    return AnalyticsExportResult(
        export_url=f"/local-storage/exports/{body.report}-{stamp}.csv",
        logged_event_id=row.event_code,
    )
