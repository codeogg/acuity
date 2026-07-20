from fastapi import APIRouter

from src.deps import AdminDep, DbSession
from src.modules.standard_fields import service
from src.modules.standard_fields.schemas import (
    DomainCreate,
    DomainOut,
    StandardFieldCreate,
    StandardFieldOut,
    StandardFieldUpdate,
    TransformRuleCreate,
    TransformRuleOut,
)

router = APIRouter(prefix="/api/admin", tags=["admin:standard-fields"])


# ---------- 信息域 ----------
@router.post("/field-domains", response_model=DomainOut)
async def create_domain(body: DomainCreate, db: DbSession, _: AdminDep) -> DomainOut:
    return DomainOut.model_validate(await service.create_domain(db, body))


@router.get("/field-domains", response_model=list[DomainOut])
async def list_domains(db: DbSession, _: AdminDep) -> list[DomainOut]:
    return [DomainOut.model_validate(d) for d in await service.list_domains(db)]


# ---------- 标准字段 ----------
@router.post("/standard-fields", response_model=StandardFieldOut)
async def create_field(
    body: StandardFieldCreate, db: DbSession, _: AdminDep
) -> StandardFieldOut:
    return StandardFieldOut.model_validate(await service.create_field(db, body))


@router.get("/standard-fields", response_model=list[StandardFieldOut])
async def list_fields(
    db: DbSession,
    _: AdminDep,
    domain_id: int | None = None,
    keyword: str | None = None,
    active_only: bool = False,
) -> list[StandardFieldOut]:
    fields = await service.list_fields(
        db, domain_id=domain_id, keyword=keyword, active_only=active_only
    )
    return [StandardFieldOut.model_validate(f) for f in fields]


@router.put("/standard-fields/{field_id}", response_model=StandardFieldOut)
async def update_field(
    field_id: int, body: StandardFieldUpdate, db: DbSession, _: AdminDep
) -> StandardFieldOut:
    return StandardFieldOut.model_validate(await service.update_field(db, field_id, body))


@router.delete("/standard-fields/{field_id}", status_code=204)
async def delete_field(field_id: int, db: DbSession, _: AdminDep) -> None:
    await service.delete_field(db, field_id)


# ---------- 转换规则 ----------
@router.post("/transform-rules", response_model=TransformRuleOut)
async def create_rule(
    body: TransformRuleCreate, db: DbSession, _: AdminDep
) -> TransformRuleOut:
    return TransformRuleOut.model_validate(await service.create_transform_rule(db, body))


@router.get("/transform-rules", response_model=list[TransformRuleOut])
async def list_rules(db: DbSession, _: AdminDep) -> list[TransformRuleOut]:
    rules = await service.list_transform_rules(db)
    return [TransformRuleOut.model_validate(r) for r in rules]
