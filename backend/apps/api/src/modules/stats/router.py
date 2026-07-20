from fastapi import APIRouter, Query

from src.deps import AdminDep, DbSession
from src.modules.stats import service
from src.modules.stats.schemas import AiUsageMonthlyResponse

router = APIRouter(prefix="/api/admin/stats", tags=["admin:stats"])


@router.get("/ai-usage", response_model=AiUsageMonthlyResponse)
async def get_ai_usage(
    db: DbSession,
    _: AdminDep,
    month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    clinic_id: int | None = Query(None),
) -> AiUsageMonthlyResponse:
    return await service.get_ai_usage_monthly(
        db, month=month, clinic_id=clinic_id
    )
