import secrets

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import (
    AppException,
    ConflictException,
    NotFoundException,
    ValidationException,
)
from src.db.models import (
    ClaimSubmission,
    Clinic,
    ClinicInsuranceCompany,
    ClinicPolicyTemplate,
    Doctor,
    InsuranceCompany,
    PolicyTemplate,
)
from src.modules.clinics.schemas import (
    ClinicConfigOverview,
    ClinicCreate,
    ClinicUpdate,
    CompanyConfigItem,
    TemplateConfigItem,
)


def _gen_code(prefix: str = "CL") -> str:
    return f"{prefix}{secrets.token_hex(4).upper()}"


async def _ensure_clinic_name_unique(
    db: AsyncSession, clinic_name: str, *, exclude_id: int | None = None
) -> str:
    normalized = clinic_name.strip()
    if not normalized:
        raise ValidationException("诊所名称不能为空")
    # 以规范化名称加事务级锁，避免两个并发请求同时通过查重。
    await db.execute(
        select(func.pg_advisory_xact_lock(func.hashtext(normalized.lower())))
    )
    stmt = select(Clinic.id).where(
        func.lower(func.btrim(Clinic.clinic_name)) == normalized.lower()
    )
    if exclude_id is not None:
        stmt = stmt.where(Clinic.id != exclude_id)
    if (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None:
        raise ConflictException("诊所名称已存在")
    return normalized


async def create_clinic(db: AsyncSession, data: ClinicCreate) -> Clinic:
    clinic_name = await _ensure_clinic_name_unique(db, data.clinic_name)
    clinic = Clinic(
        clinic_code=data.clinic_code or _gen_code(),
        clinic_name=clinic_name,
        clinic_name_en=data.clinic_name_en,
        address=data.address,
        phone=data.phone,
        chop_image_url=data.chop_image_url,
    )
    db.add(clinic)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("诊所名称或编码已存在") from exc
    return clinic


async def list_clinics(
    db: AsyncSession, *, page: int, page_size: int, keyword: str | None
) -> tuple[list[Clinic], int]:
    stmt = select(Clinic)
    count_stmt = select(func.count()).select_from(Clinic)
    if keyword:
        cond = Clinic.clinic_name.ilike(f"%{keyword}%")
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(Clinic.id.desc()).offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(stmt)).scalars().all())
    return items, total


async def get_clinic(db: AsyncSession, clinic_id: int) -> Clinic:
    clinic = await db.get(Clinic, clinic_id)
    if not clinic:
        raise NotFoundException("诊所不存在")
    return clinic


async def update_clinic(db: AsyncSession, clinic_id: int, data: ClinicUpdate) -> Clinic:
    clinic = await get_clinic(db, clinic_id)
    updates = data.model_dump(exclude_unset=True)
    if updates.get("clinic_name") is not None:
        updates["clinic_name"] = await _ensure_clinic_name_unique(
            db, updates["clinic_name"], exclude_id=clinic_id
        )
    for key, value in updates.items():
        setattr(clinic, key, value)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("诊所名称或编码已存在") from exc
    return clinic


async def set_status(db: AsyncSession, clinic_id: int, status: int) -> Clinic:
    clinic = await get_clinic(db, clinic_id)
    clinic.status = status
    await db.flush()
    return clinic


async def delete_clinic(db: AsyncSession, clinic_id: int) -> None:
    """删除诊所。存在关联医生或理赔单时拒绝删除，仅级联清理保司/模板配置关联。"""
    clinic = await get_clinic(db, clinic_id)

    doctor_count = (
        await db.execute(
            select(func.count()).select_from(Doctor).where(Doctor.clinic_id == clinic_id)
        )
    ).scalar_one()
    if doctor_count:
        raise ConflictException("该诊所存在关联医生，请先删除或转移后再删除诊所")

    claim_count = (
        await db.execute(
            select(func.count())
            .select_from(ClaimSubmission)
            .where(ClaimSubmission.clinic_id == clinic_id)
        )
    ).scalar_one()
    if claim_count:
        raise ConflictException("该诊所存在关联理赔单，无法删除")

    await db.execute(
        delete(ClinicInsuranceCompany).where(
            ClinicInsuranceCompany.clinic_id == clinic_id
        )
    )
    await db.execute(
        delete(ClinicPolicyTemplate).where(ClinicPolicyTemplate.clinic_id == clinic_id)
    )
    await db.delete(clinic)
    await db.flush()


async def get_insurance_company_ids(db: AsyncSession, clinic_id: int) -> list[int]:
    await get_clinic(db, clinic_id)
    rows = await db.execute(
        select(ClinicInsuranceCompany.company_id).where(
            ClinicInsuranceCompany.clinic_id == clinic_id
        )
    )
    return [r[0] for r in rows.all()]


async def set_insurance_companies(
    db: AsyncSession, clinic_id: int, company_ids: list[int]
) -> list[int]:
    """全量覆盖式更新诊所可用保司。"""
    await get_clinic(db, clinic_id)
    await db.execute(
        delete(ClinicInsuranceCompany).where(
            ClinicInsuranceCompany.clinic_id == clinic_id
        )
    )
    for cid in set(company_ids):
        db.add(ClinicInsuranceCompany(clinic_id=clinic_id, company_id=cid))
    await db.flush()
    return sorted(set(company_ids))


# ---------- 诊所-保司-模板 配置视图 ----------
async def get_config_overview(db: AsyncSession, clinic_id: int) -> ClinicConfigOverview:
    """一次性构建诊所的保司与模板配置视图（避免 N+1）。"""
    await get_clinic(db, clinic_id)

    companies = list(
        (
            await db.execute(
                select(InsuranceCompany)
                .where(InsuranceCompany.status == 1)
                .order_by(InsuranceCompany.id)
            )
        )
        .scalars()
        .all()
    )
    company_ids = [c.id for c in companies]

    templates: list[PolicyTemplate] = []
    if company_ids:
        templates = list(
            (
                await db.execute(
                    select(PolicyTemplate)
                    .where(PolicyTemplate.company_id.in_(company_ids))
                    .order_by(
                        PolicyTemplate.company_id,
                        PolicyTemplate.is_active.desc(),
                        PolicyTemplate.id,
                    )
                )
            )
            .scalars()
            .all()
        )

    enabled_company_ids = {
        row[0]
        for row in (
            await db.execute(
                select(ClinicInsuranceCompany.company_id).where(
                    ClinicInsuranceCompany.clinic_id == clinic_id,
                    ClinicInsuranceCompany.status == 1,
                )
            )
        ).all()
    }
    enabled_template_ids = {
        row[0]
        for row in (
            await db.execute(
                select(ClinicPolicyTemplate.template_id).where(
                    ClinicPolicyTemplate.clinic_id == clinic_id,
                    ClinicPolicyTemplate.status == 1,
                )
            )
        ).all()
    }

    templates_by_company: dict[int, list[PolicyTemplate]] = {}
    for t in templates:
        templates_by_company.setdefault(t.company_id, []).append(t)

    items: list[CompanyConfigItem] = []
    for c in companies:
        c_templates = templates_by_company.get(c.id, [])
        tpl_items = [
            TemplateConfigItem(
                template_id=t.id,
                template_name=t.template_name,
                version=t.version,
                parse_status=t.parse_status,
                is_active=t.is_active,
                enabled=t.id in enabled_template_ids,
                updated_at=t.updated_at,
            )
            for t in c_templates
        ]
        items.append(
            CompanyConfigItem(
                company_id=c.id,
                company_name=c.company_name,
                enabled=c.id in enabled_company_ids,
                template_count=len(tpl_items),
                enabled_template_count=sum(1 for i in tpl_items if i.enabled),
                templates=tpl_items,
            )
        )

    return ClinicConfigOverview(companies=items)


async def set_company_enabled(
    db: AsyncSession, clinic_id: int, company_id: int, enabled: bool
) -> None:
    """切换诊所-保司启用状态（保留关系行，仅改 status，模板勾选不受影响）。"""
    await get_clinic(db, clinic_id)
    company = await db.get(InsuranceCompany, company_id)
    if not company:
        raise NotFoundException("保险公司不存在")

    row = (
        await db.execute(
            select(ClinicInsuranceCompany).where(
                ClinicInsuranceCompany.clinic_id == clinic_id,
                ClinicInsuranceCompany.company_id == company_id,
            )
        )
    ).scalar_one_or_none()
    status = 1 if enabled else 0
    if row:
        row.status = status
    elif enabled:
        db.add(
            ClinicInsuranceCompany(
                clinic_id=clinic_id, company_id=company_id, status=status
            )
        )
    await db.flush()


async def set_template_enabled(
    db: AsyncSession, clinic_id: int, template_id: int, enabled: bool
) -> None:
    """切换诊所-模板启用状态；启用时校验模板已发布。"""
    await get_clinic(db, clinic_id)
    template = await db.get(PolicyTemplate, template_id)
    if not template:
        raise NotFoundException("模板不存在")
    if enabled and not template.is_active:
        raise AppException("模板未发布，无法分配给诊所")

    row = (
        await db.execute(
            select(ClinicPolicyTemplate).where(
                ClinicPolicyTemplate.clinic_id == clinic_id,
                ClinicPolicyTemplate.template_id == template_id,
            )
        )
    ).scalar_one_or_none()
    status = 1 if enabled else 0
    if row:
        row.status = status
    elif enabled:
        db.add(
            ClinicPolicyTemplate(
                clinic_id=clinic_id, template_id=template_id, status=status
            )
        )
    await db.flush()


async def set_company_templates(
    db: AsyncSession, clinic_id: int, company_id: int, template_ids: list[int]
) -> list[int]:
    """全量覆盖该保司下诊所可用模板；仅已发布模板可被启用。"""
    await get_clinic(db, clinic_id)
    company = await db.get(InsuranceCompany, company_id)
    if not company:
        raise NotFoundException("保险公司不存在")

    # 该保司下所有模板 id，以及其中已发布(is_active)的 id
    rows = (
        await db.execute(
            select(PolicyTemplate.id, PolicyTemplate.is_active).where(
                PolicyTemplate.company_id == company_id
            )
        )
    ).all()
    all_ids = {r[0] for r in rows}
    active_ids = {r[0] for r in rows if r[1]}
    to_enable = active_ids & set(template_ids)

    if all_ids:
        await db.execute(
            delete(ClinicPolicyTemplate).where(
                ClinicPolicyTemplate.clinic_id == clinic_id,
                ClinicPolicyTemplate.template_id.in_(all_ids),
            )
        )
    for tid in to_enable:
        db.add(
            ClinicPolicyTemplate(clinic_id=clinic_id, template_id=tid, status=1)
        )
    await db.flush()
    return sorted(to_enable)
