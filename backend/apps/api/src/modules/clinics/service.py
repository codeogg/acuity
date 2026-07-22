import secrets

from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

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
    ClinicSubscription,
    District,
    Doctor,
    DoctorClinicLink,
    InsuranceCompany,
    PolicyTemplate,
)
from src.modules.clinics.schemas import (
    DATA_REGIONS,
    ClinicConfigOverview,
    ClinicCreate,
    ClinicOut,
    ClinicUpdate,
    CompanyConfigItem,
    TemplateConfigItem,
)
from src.core.idle_lock import validate_idle_lock_minutes


def _gen_code(prefix: str = "CL") -> str:
    return f"{prefix}{secrets.token_hex(4).upper()}"


def _normalize_data_region(value: str | None, *, required: bool = False) -> str | None:
    if value is None:
        return None if not required else "香港"
    normalized = value.strip()
    if normalized not in DATA_REGIONS:
        raise ValidationException("数据存放地区仅支持：香港 / 新加坡 / 美国")
    return normalized


def clinic_to_out(clinic: Clinic) -> ClinicOut:
    sub = clinic.subscription
    return ClinicOut(
        id=clinic.id,
        clinic_code=clinic.clinic_code,
        clinic_name=clinic.clinic_name,
        clinic_name_en=clinic.clinic_name_en,
        address=clinic.address,
        phone=clinic.phone,
        chop_image_url=clinic.chop_image_url,
        status=clinic.status,
        idle_lock_minutes=clinic.idle_lock_minutes,
        data_region=clinic.data_region or "香港",
        is_flagged=int(clinic.is_flagged or 0),
        district_id=clinic.district_id,
        district_name_zh=clinic.district.name_zh if clinic.district else None,
        district_name_en=clinic.district.name_en if clinic.district else None,
        created_at=clinic.created_at,
        subscription_status=sub.subscription_status if sub else None,
        payment_status=sub.payment_status if sub else None,
        plan_code=sub.plan_code if sub else None,
    )


async def _resolve_district_id(
    db: AsyncSession, district_id: int | None
) -> int | None:
    """Validate district_id against districts dictionary; None clears the link."""
    if district_id is None:
        return None
    district = await db.get(District, district_id)
    if district is None:
        raise ValidationException("地区不存在，请从地区字典中选择")
    return district.id


_CLINIC_LOAD = (
    selectinload(Clinic.district),
    selectinload(Clinic.subscription),
)

async def _ensure_clinic_name_unique(
    db: AsyncSession, clinic_name: str, *, exclude_id: int | None = None
) -> str:
    normalized = clinic_name.strip()
    if not normalized:
        raise ValidationException("诊所名称不能为空")
    # 以规范化名称加事务级锁，避免两个并发请求同时通过查重。
    await db.execute(
        select(func.pg_advisory_xact_lock(func.hashtext(f"zh:{normalized.lower()}")))
    )
    stmt = select(Clinic.id).where(
        func.lower(func.btrim(Clinic.clinic_name)) == normalized.lower()
    )
    if exclude_id is not None:
        stmt = stmt.where(Clinic.id != exclude_id)
    if (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None:
        raise ConflictException("诊所中文名称已存在")
    return normalized


async def _ensure_clinic_name_en_unique(
    db: AsyncSession,
    clinic_name_en: str | None,
    *,
    exclude_id: int | None = None,
) -> str | None:
    if clinic_name_en is None:
        return None
    normalized = clinic_name_en.strip()
    if not normalized:
        return None
    await db.execute(
        select(func.pg_advisory_xact_lock(func.hashtext(f"en:{normalized.lower()}")))
    )
    stmt = select(Clinic.id).where(
        Clinic.clinic_name_en.is_not(None),
        func.lower(func.btrim(Clinic.clinic_name_en)) == normalized.lower(),
    )
    if exclude_id is not None:
        stmt = stmt.where(Clinic.id != exclude_id)
    if (await db.execute(stmt.limit(1))).scalar_one_or_none() is not None:
        raise ConflictException("诊所英文名称已存在")
    return normalized


def _parse_sort(sort: str | None) -> tuple[str, bool]:
    """解析 ?sort=name / ?sort=-doctors，返回 (字段, 是否降序)。"""
    if not sort:
        return "id", True
    desc = sort.startswith("-")
    key = sort[1:] if desc else sort
    allowed = {"name", "code", "status", "doctors", "created_at", "id"}
    if key not in allowed:
        return "id", True
    return key, desc


def _apply_clinic_sort(stmt, sort: str | None):
    key, desc = _parse_sort(sort)
    # Align with GET /admin/doctors?clinic_id=… — count any clinic link, not
    # only the primary doctor.clinic_id mirror.
    doctor_count = (
        select(func.count())
        .select_from(DoctorClinicLink)
        .where(DoctorClinicLink.clinic_id == Clinic.id)
        .correlate(Clinic)
        .scalar_subquery()
    )
    order_cols = {
        "id": Clinic.id,
        "name": func.lower(Clinic.clinic_name),
        "code": Clinic.clinic_code,
        "status": Clinic.status,
        "doctors": doctor_count,
        "created_at": Clinic.created_at,
    }
    col = order_cols[key]
    return stmt.order_by(col.desc() if desc else col.asc(), Clinic.id.desc())


async def create_clinic(db: AsyncSession, data: ClinicCreate) -> Clinic:
    clinic_name = await _ensure_clinic_name_unique(db, data.clinic_name)
    clinic_name_en = await _ensure_clinic_name_en_unique(db, data.clinic_name_en)
    district_id = await _resolve_district_id(db, data.district_id)
    data_region = _normalize_data_region(data.data_region) or "香港"
    clinic = Clinic(
        clinic_code=data.clinic_code or _gen_code(),
        clinic_name=clinic_name,
        clinic_name_en=clinic_name_en,
        address=data.address,
        phone=data.phone,
        chop_image_url=data.chop_image_url,
        district_id=district_id,
        data_region=data_region,
        is_flagged=0,
    )
    db.add(clinic)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("诊所名称或编码已存在") from exc
    await db.refresh(clinic, attribute_names=["district"])
    from src.modules.clinics.subscription_service import ensure_default_subscription

    await ensure_default_subscription(db, clinic.id)
    await db.refresh(clinic, attribute_names=["district", "subscription"])
    return clinic


async def list_clinics(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    keyword: str | None,
    sort: str | None = None,
    is_flagged: int | None = None,
) -> tuple[list[Clinic], int]:
    stmt = select(Clinic).options(*_CLINIC_LOAD)
    count_stmt = select(func.count()).select_from(Clinic)
    if is_flagged is not None:
        flagged = 1 if is_flagged else 0
        stmt = stmt.where(Clinic.is_flagged == flagged)
        count_stmt = count_stmt.where(Clinic.is_flagged == flagged)
    if keyword:
        like = f"%{keyword}%"
        cond = or_(
            Clinic.clinic_name.ilike(like),
            Clinic.clinic_name_en.ilike(like),
            Clinic.clinic_code.ilike(like),
            District.name_zh.ilike(like),
        )
        stmt = stmt.outerjoin(District, Clinic.district_id == District.id).where(cond)
        count_stmt = count_stmt.outerjoin(
            District, Clinic.district_id == District.id
        ).where(cond)
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = _apply_clinic_sort(stmt, sort)
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    items = list((await db.execute(stmt)).scalars().unique().all())
    return items, total


async def get_clinic(db: AsyncSession, clinic_id: int) -> Clinic:
    clinic = (
        await db.execute(
            select(Clinic).options(*_CLINIC_LOAD).where(Clinic.id == clinic_id)
        )
    ).scalar_one_or_none()
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
    if "clinic_name_en" in updates:
        updates["clinic_name_en"] = await _ensure_clinic_name_en_unique(
            db, updates["clinic_name_en"], exclude_id=clinic_id
        )
    if updates.get("idle_lock_minutes") is not None:
        updates["idle_lock_minutes"] = validate_idle_lock_minutes(
            updates["idle_lock_minutes"]
        )
    if "district_id" in updates:
        updates["district_id"] = await _resolve_district_id(db, updates["district_id"])
    if "data_region" in updates:
        updates["data_region"] = _normalize_data_region(
            updates["data_region"], required=True
        )
    for key, value in updates.items():
        setattr(clinic, key, value)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("诊所名称或编码已存在") from exc
    await db.refresh(clinic, attribute_names=["district"])
    return clinic


async def set_status(db: AsyncSession, clinic_id: int, status: int) -> Clinic:
    clinic = await get_clinic(db, clinic_id)
    clinic.status = status
    await db.flush()
    return clinic


async def set_flagged(db: AsyncSession, clinic_id: int, is_flagged: int) -> Clinic:
    clinic = await get_clinic(db, clinic_id)
    clinic.is_flagged = 1 if is_flagged else 0
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
    await db.execute(
        delete(ClinicSubscription).where(ClinicSubscription.clinic_id == clinic_id)
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
