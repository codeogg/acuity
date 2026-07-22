from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ConflictException, NotFoundException, ValidationException
from src.db.models import Clinic, District
from src.modules.districts.schemas import DistrictCreate, DistrictUpdate

_REGION_ORDER = case(
    (District.region == "港島", 1),
    (District.region == "九龍", 2),
    (District.region == "新界", 3),
    else_=9,
)


async def list_districts(
    db: AsyncSession, *, region: str | None = None
) -> list[District]:
    stmt = select(District).order_by(
        _REGION_ORDER.asc(),
        District.name_zh.asc(),
        District.id.asc(),
    )
    if region:
        stmt = stmt.where(District.region == region)
    return list((await db.execute(stmt)).scalars().all())


async def get_district(db: AsyncSession, district_id: int) -> District:
    district = await db.get(District, district_id)
    if district is None:
        raise NotFoundException("地区不存在")
    return district


async def create_district(db: AsyncSession, data: DistrictCreate) -> District:
    name_zh = data.name_zh.strip()
    if not name_zh:
        raise ValidationException("地区中文名称不能为空")
    existing = (
        await db.execute(
            select(District).where(func.lower(District.name_zh) == name_zh.lower())
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictException("地区中文名称已存在")

    name_en = data.name_en.strip() if data.name_en else None
    region = data.region.strip() if data.region else None
    district = District(name_zh=name_zh, name_en=name_en or None, region=region or None)
    db.add(district)
    await db.flush()
    return district


async def update_district(
    db: AsyncSession, district_id: int, data: DistrictUpdate
) -> District:
    district = await get_district(db, district_id)
    values = data.model_dump(exclude_unset=True)
    if "name_zh" in values and values["name_zh"] is not None:
        name_zh = values["name_zh"].strip()
        if not name_zh:
            raise ValidationException("地区中文名称不能为空")
        conflict = (
            await db.execute(
                select(District).where(
                    func.lower(District.name_zh) == name_zh.lower(),
                    District.id != district_id,
                )
            )
        ).scalar_one_or_none()
        if conflict is not None:
            raise ConflictException("地区中文名称已存在")
        values["name_zh"] = name_zh
    if "name_en" in values and values["name_en"] is not None:
        values["name_en"] = values["name_en"].strip() or None
    if "region" in values and values["region"] is not None:
        values["region"] = values["region"].strip() or None
    for key, value in values.items():
        setattr(district, key, value)
    await db.flush()
    return district


async def delete_district(db: AsyncSession, district_id: int) -> None:
    district = await get_district(db, district_id)
    in_use = (
        await db.execute(
            select(func.count()).select_from(Clinic).where(Clinic.district_id == district_id)
        )
    ).scalar_one()
    if in_use:
        raise ConflictException("该地区仍有关联诊所，无法删除")
    await db.delete(district)
    await db.flush()
