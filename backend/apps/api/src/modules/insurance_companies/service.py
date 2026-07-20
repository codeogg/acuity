import secrets

from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ConflictException, NotFoundException
from src.db.models import (
    ClaimSubmission,
    ClinicInsuranceCompany,
    InsuranceCompany,
    PolicyTemplate,
)
from src.modules.insurance_companies.schemas import CompanyCreate, CompanyUpdate


async def _ensure_unique_name(
    db: AsyncSession, name: str | None, *, exclude_id: int | None = None
) -> None:
    if not name:
        return
    stmt = select(InsuranceCompany.id).where(InsuranceCompany.company_name == name)
    if exclude_id is not None:
        stmt = stmt.where(InsuranceCompany.id != exclude_id)
    if (await db.execute(stmt)).first():
        raise ConflictException("保险公司名称已存在")


async def create_company(db: AsyncSession, data: CompanyCreate) -> InsuranceCompany:
    await _ensure_unique_name(db, data.company_name)
    company = InsuranceCompany(
        company_code=data.company_code or f"IC{secrets.token_hex(4).upper()}",
        company_name=data.company_name,
        company_name_en=data.company_name_en,
        logo_url=data.logo_url,
        contact_info=data.contact_info,
    )
    db.add(company)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("保险公司名称或编码已存在") from exc
    return company


async def list_companies(
    db: AsyncSession, *, page: int, page_size: int, keyword: str | None = None
) -> tuple[list[InsuranceCompany], int]:
    stmt = select(InsuranceCompany)
    count_stmt = select(func.count()).select_from(InsuranceCompany)
    if keyword:
        like = f"%{keyword}%"
        cond = or_(
            InsuranceCompany.company_name.ilike(like),
            InsuranceCompany.company_name_en.ilike(like),
            InsuranceCompany.company_code.ilike(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = (
        stmt.order_by(InsuranceCompany.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return list((await db.execute(stmt)).scalars().all()), total


async def get_company(db: AsyncSession, company_id: int) -> InsuranceCompany:
    company = await db.get(InsuranceCompany, company_id)
    if not company:
        raise NotFoundException("保险公司不存在")
    return company


async def update_company(
    db: AsyncSession, company_id: int, data: CompanyUpdate
) -> InsuranceCompany:
    company = await get_company(db, company_id)
    values = data.model_dump(exclude_unset=True)
    await _ensure_unique_name(db, values.get("company_name"), exclude_id=company_id)
    for key, value in values.items():
        setattr(company, key, value)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("保险公司名称或编码已存在") from exc
    return company


async def set_status(db: AsyncSession, company_id: int, status: int) -> InsuranceCompany:
    company = await get_company(db, company_id)
    company.status = status
    await db.flush()
    return company


async def delete_company(db: AsyncSession, company_id: int) -> None:
    """删除保险公司。存在保单模板或理赔单时拒绝，仅级联清理诊所-保司关联。"""
    company = await get_company(db, company_id)

    template_count = (
        await db.execute(
            select(func.count())
            .select_from(PolicyTemplate)
            .where(PolicyTemplate.company_id == company_id)
        )
    ).scalar_one()
    if template_count:
        raise ConflictException("该保险公司已配置保单模板，无法删除，可改为停用")

    claim_count = (
        await db.execute(
            select(func.count())
            .select_from(ClaimSubmission)
            .where(ClaimSubmission.company_id == company_id)
        )
    ).scalar_one()
    if claim_count:
        raise ConflictException("该保险公司存在关联理赔单，无法删除")

    await db.execute(
        delete(ClinicInsuranceCompany).where(
            ClinicInsuranceCompany.company_id == company_id
        )
    )
    await db.delete(company)
    await db.flush()
