"""AI 用量统计查询。"""
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ValidationException
from src.modules.stats.schemas import (
    AiUsageMonthlyItem,
    AiUsageMonthlyResponse,
    AiUsageSummary,
)


def _parse_month(month: str | None) -> date | None:
    if month is None:
        return None
    try:
        return datetime.strptime(month, "%Y-%m").date()
    except ValueError as exc:
        raise ValidationException("月份格式必须为 YYYY-MM") from exc


async def get_ai_usage_monthly(
    db: AsyncSession, *, month: str | None, clinic_id: int | None
) -> AiUsageMonthlyResponse:
    month_value = _parse_month(month)
    filters: list[str] = []
    params: dict[str, object] = {}
    if month_value is not None:
        filters.append("usage.usage_month::date = :usage_month")
        params["usage_month"] = month_value
    if clinic_id is not None:
        filters.append("usage.clinic_id = :clinic_id")
        params["clinic_id"] = clinic_id
    where_clause = f"WHERE {' AND '.join(filters)}" if filters else ""

    result = await db.execute(
        text(
            f"""
            SELECT
                usage.usage_month,
                usage.clinic_id,
                clinic.clinic_name,
                usage.model,
                usage.purpose,
                usage.call_count,
                usage.input_tokens,
                usage.output_tokens,
                usage.total_tokens,
                usage.estimated_cost_usd
            FROM ai_usage_monthly_by_clinic AS usage
            LEFT JOIN clinic ON clinic.id = usage.clinic_id
            {where_clause}
            ORDER BY usage.usage_month DESC, usage.call_count DESC, usage.purpose
            """
        ),
        params,
    )
    items = [
        AiUsageMonthlyItem(
            usage_month=row.usage_month,
            clinic_id=row.clinic_id,
            clinic_name=row.clinic_name,
            model=row.model,
            purpose=row.purpose,
            call_count=int(row.call_count),
            input_tokens=int(row.input_tokens),
            output_tokens=int(row.output_tokens),
            total_tokens=int(row.total_tokens),
            estimated_cost_usd=Decimal(row.estimated_cost_usd or 0),
        )
        for row in result
    ]
    return AiUsageMonthlyResponse(
        summary=AiUsageSummary(
            call_count=sum(item.call_count for item in items),
            input_tokens=sum(item.input_tokens for item in items),
            output_tokens=sum(item.output_tokens for item in items),
            total_tokens=sum(item.total_tokens for item in items),
            estimated_cost_usd=sum(
                (item.estimated_cost_usd for item in items), start=Decimal("0")
            ),
        ),
        items=items,
    )
