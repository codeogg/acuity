from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ConflictException, NotFoundException
from src.db.models import (
    ClaimFieldChangeLog,
    FieldDomain,
    FieldTransformRule,
    StandardField,
    TemplateFieldMapping,
)
from src.modules.standard_fields.schemas import (
    DomainCreate,
    StandardFieldCreate,
    StandardFieldUpdate,
    TransformRuleCreate,
)


# ---------- 信息域 ----------
async def create_domain(db: AsyncSession, data: DomainCreate) -> FieldDomain:
    domain = FieldDomain(**data.model_dump())
    db.add(domain)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("域编码已存在") from exc
    return domain


async def list_domains(db: AsyncSession) -> list[FieldDomain]:
    stmt = select(FieldDomain).order_by(FieldDomain.sort_order, FieldDomain.id)
    return list((await db.execute(stmt)).scalars().all())


# ---------- 标准字段 ----------
async def _ensure_code_unique(
    db: AsyncSession, field_code: str, *, exclude_id: int | None = None
) -> None:
    stmt = select(StandardField.id).where(StandardField.field_code == field_code)
    if exclude_id is not None:
        stmt = stmt.where(StandardField.id != exclude_id)
    if (await db.execute(stmt)).first():
        raise ConflictException("字段编码已存在")


async def create_field(db: AsyncSession, data: StandardFieldCreate) -> StandardField:
    await _ensure_code_unique(db, data.field_code)
    field = StandardField(**data.model_dump())
    db.add(field)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("字段编码已存在") from exc
    return field


async def list_fields(
    db: AsyncSession, *, domain_id: int | None, keyword: str | None, active_only: bool
) -> list[StandardField]:
    stmt = select(StandardField)
    if domain_id:
        stmt = stmt.where(StandardField.domain_id == domain_id)
    if active_only:
        stmt = stmt.where(StandardField.is_active.is_(True))
    if keyword:
        stmt = stmt.where(
            StandardField.field_name.ilike(f"%{keyword}%")
            | StandardField.field_code.ilike(f"%{keyword}%")
        )
    stmt = stmt.order_by(StandardField.domain_id, StandardField.id)
    return list((await db.execute(stmt)).scalars().all())


async def get_field(db: AsyncSession, field_id: int) -> StandardField:
    field = await db.get(StandardField, field_id)
    if not field:
        raise NotFoundException("标准字段不存在")
    return field


async def update_field(
    db: AsyncSession, field_id: int, data: StandardFieldUpdate
) -> StandardField:
    field = await get_field(db, field_id)
    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(field, key, value)
    await db.flush()
    return field


async def delete_field(db: AsyncSession, field_id: int) -> None:
    """删除标准字段。被模板映射或理赔记录引用时拒绝删除。"""
    field = await get_field(db, field_id)

    mapping_count = (
        await db.execute(
            select(func.count())
            .select_from(TemplateFieldMapping)
            .where(TemplateFieldMapping.standard_field_id == field_id)
        )
    ).scalar_one()
    if mapping_count:
        raise ConflictException("该字段已被模板映射引用，无法删除，可改为停用")

    log_count = (
        await db.execute(
            select(func.count())
            .select_from(ClaimFieldChangeLog)
            .where(ClaimFieldChangeLog.standard_field_id == field_id)
        )
    ).scalar_one()
    if log_count:
        raise ConflictException("该字段存在理赔变更记录，无法删除，可改为停用")

    await db.delete(field)
    await db.flush()


# ---------- 转换规则 ----------
async def create_transform_rule(
    db: AsyncSession, data: TransformRuleCreate
) -> FieldTransformRule:
    rule = FieldTransformRule(**data.model_dump())
    db.add(rule)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("规则编码已存在") from exc
    return rule


async def list_transform_rules(db: AsyncSession) -> list[FieldTransformRule]:
    return list((await db.execute(select(FieldTransformRule))).scalars().all())
