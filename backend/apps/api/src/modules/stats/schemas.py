from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class AiUsageMonthlyItem(BaseModel):
    usage_month: datetime
    clinic_id: int | None
    clinic_name: str | None
    model: str
    purpose: str
    call_count: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: Decimal


class AiUsageSummary(BaseModel):
    call_count: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: Decimal


class AiUsageMonthlyResponse(BaseModel):
    summary: AiUsageSummary
    items: list[AiUsageMonthlyItem]
