from fastapi import APIRouter, Query

from src.deps import AdminDep, DbSession
from src.modules.districts import service
from src.modules.districts.schemas import (
    DistrictCreate,
    DistrictOut,
    DistrictUpdate,
)

router = APIRouter(prefix="/api/admin/districts", tags=["admin:districts"])


@router.get("", response_model=list[DistrictOut])
async def list_districts(
    db: DbSession,
    _: AdminDep,
    region: str | None = Query(None, description="按大区筛选：港島 / 九龍 / 新界"),
) -> list[DistrictOut]:
    items = await service.list_districts(db, region=region)
    return [DistrictOut.model_validate(d) for d in items]


@router.post("", response_model=DistrictOut)
async def create_district(
    body: DistrictCreate, db: DbSession, _: AdminDep
) -> DistrictOut:
    return DistrictOut.model_validate(await service.create_district(db, body))


@router.get("/{district_id}", response_model=DistrictOut)
async def get_district(
    district_id: int, db: DbSession, _: AdminDep
) -> DistrictOut:
    return DistrictOut.model_validate(await service.get_district(db, district_id))


@router.put("/{district_id}", response_model=DistrictOut)
async def update_district(
    district_id: int, body: DistrictUpdate, db: DbSession, _: AdminDep
) -> DistrictOut:
    return DistrictOut.model_validate(
        await service.update_district(db, district_id, body)
    )


@router.delete("/{district_id}", status_code=204)
async def delete_district(district_id: int, db: DbSession, _: AdminDep) -> None:
    await service.delete_district(db, district_id)
