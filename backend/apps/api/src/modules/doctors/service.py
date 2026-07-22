import secrets

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import AppException, ConflictException, NotFoundException, ValidationException
from src.core.security import hash_password
from src.db.models import (
    ClaimSubmission,
    Clinic,
    Doctor,
    DoctorClinicLink,
    ExtractionReviewOutput,
    ExtractionTask,
    FormTag,
)
from src.modules.doctors import clinic_links as clinic_link_service
from src.modules.doctors.clinic_links import ensure_primary_clinic_link
from src.modules.doctors.schemas import DoctorCreate, DoctorUpdate, NOTE_FORMATS


async def _default_specialty_tag_id(db: AsyncSession) -> int:
    tag_id = (
        await db.execute(
            select(FormTag.id).where(
                FormTag.kind == "specialty",
                FormTag.label_en == "General practice",
                FormTag.retired.is_(False),
            )
        )
    ).scalar_one_or_none()
    if tag_id is None:
        raise ValidationException("系统未配置默认专科标签（全科），请先初始化标签")
    return int(tag_id)


async def _validate_specialty_tag(db: AsyncSession, tag_id: int) -> int:
    tag = await db.get(FormTag, tag_id)
    if tag is None:
        raise NotFoundException("专科标签不存在")
    if tag.kind != "specialty":
        raise ValidationException("所选标签不是专科分类")
    if tag.retired:
        raise ValidationException("所选专科已停用，请选择其他专科")
    return tag.id


async def _load_specialty_tags(
    db: AsyncSession, tag_ids: set[int]
) -> dict[int, FormTag]:
    if not tag_ids:
        return {}
    rows = (
        await db.execute(select(FormTag).where(FormTag.id.in_(tag_ids)))
    ).scalars().all()
    return {tag.id: tag for tag in rows}


def _specialty_labels(tag: FormTag | None) -> tuple[str, str]:
    if tag is None:
        return "General practice", "全科"
    return tag.label_en, tag.label_zh


def _doctor_base_out(doctor: Doctor, tag: FormTag | None) -> dict:
    label_en, label_zh = _specialty_labels(tag)
    notes_format = doctor.account_notes_format or "markdown"
    if notes_format not in NOTE_FORMATS:
        notes_format = "markdown"
    separation = doctor.workspace_mode
    if separation not in ("separated", "merged"):
        separation = "separated"
    return {
        "id": doctor.id,
        "clinic_id": doctor.clinic_id,
        "doctor_name": doctor.doctor_name,
        "doctor_name_en": doctor.doctor_name_en,
        "reg_no": doctor.reg_no,
        "email": doctor.email,
        "signature_url": doctor.signature_url,
        "login_account": doctor.login_account,
        "status": doctor.status,
        "workspace_mode": doctor.workspace_mode,
        "account_notes": doctor.account_notes,
        "account_notes_format": notes_format,
        "specialty_tag_id": doctor.specialty_tag_id,
        "specialty_label_en": label_en,
        "specialty_label_zh": label_zh,
        "created_at": doctor.created_at,
        "notes": doctor.account_notes or "",
        "notes_format": notes_format,
        "workspace_separation": separation,
    }


async def doctor_to_out(db: AsyncSession, doctor: Doctor) -> dict:
    tag = await db.get(FormTag, doctor.specialty_tag_id)
    return _doctor_base_out(doctor, tag)


async def list_linked_clinic_ids(db: AsyncSession, doctor_id: int) -> list[int]:
    return await clinic_link_service.list_linked_clinic_ids(db, doctor_id)


async def to_doctor_account_out(
    db: AsyncSession,
    doctor: Doctor,
    *,
    clinic_ids: list[int] | None = None,
    specialty_tag: FormTag | None = None,
) -> dict:
    if clinic_ids is None:
        clinic_ids = await list_linked_clinic_ids(db, doctor.id)
    if specialty_tag is None:
        specialty_tag = await db.get(FormTag, doctor.specialty_tag_id)
    return {
        **_doctor_base_out(doctor, specialty_tag),
        "clinic_ids": clinic_ids,
        "mfa_enabled": doctor.mfa_enabled,
        "account_locked": doctor.account_locked,
        "registration_status": doctor.registration_status,
    }


async def get_doctor_account(db: AsyncSession, doctor_id: int):
    from src.modules.doctors.schemas import DoctorAccountOut

    doctor = await get_doctor(db, doctor_id)
    return DoctorAccountOut.model_validate(await to_doctor_account_out(db, doctor))


# Alias kept for older call sites that still use the private name.
_doctor_account_out = get_doctor_account


async def list_doctor_accounts(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    clinic_id: int | None,
    keyword: str | None = None,
    linked: str | None = None,
) -> tuple[list, int]:
    from src.modules.doctors.schemas import DoctorAccountOut

    items, total = await list_doctors(
        db,
        page=page,
        page_size=page_size,
        clinic_id=clinic_id,
        keyword=keyword,
        linked=linked,
    )
    link_map = await clinic_link_service.map_linked_clinic_ids(
        db, [doctor.id for doctor in items]
    )
    tag_map = await _load_specialty_tags(
        db, {doctor.specialty_tag_id for doctor in items}
    )
    accounts = [
        DoctorAccountOut.model_validate(
            await to_doctor_account_out(
                db,
                doctor,
                clinic_ids=link_map.get(doctor.id, []),
                specialty_tag=tag_map.get(doctor.specialty_tag_id),
            )
        )
        for doctor in items
    ]
    return accounts, total


async def link_clinic_account(
    db: AsyncSession, doctor_id: int, clinic_id: int
):
    await link_clinic(db, doctor_id, clinic_id)
    return await get_doctor_account(db, doctor_id)


async def unlink_clinic_account(
    db: AsyncSession, doctor_id: int, clinic_id: int
):
    await unlink_clinic(db, doctor_id, clinic_id)
    return await get_doctor_account(db, doctor_id)


async def set_doctor_clinics_account(
    db: AsyncSession, doctor_id: int, clinic_ids: list[int]
):
    await get_doctor(db, doctor_id)
    await clinic_link_service.set_doctor_clinics(
        db, doctor_id=doctor_id, clinic_ids=clinic_ids
    )
    return await get_doctor_account(db, doctor_id)


async def _ensure_unique(
    db: AsyncSession,
    *,
    login_account: str | None = None,
    reg_no: str | None = None,
    exclude_id: int | None = None,
) -> None:
    """校验登录账号、注册编号唯一（数据库对 reg_no 无唯一约束，需应用层保证）。"""
    if login_account:
        stmt = select(Doctor.id).where(Doctor.login_account == login_account)
        if exclude_id is not None:
            stmt = stmt.where(Doctor.id != exclude_id)
        if (await db.execute(stmt)).first():
            raise ConflictException("登录账号已存在")
    if reg_no:
        stmt = select(Doctor.id).where(Doctor.reg_no == reg_no)
        if exclude_id is not None:
            stmt = stmt.where(Doctor.id != exclude_id)
        if (await db.execute(stmt)).first():
            raise ConflictException("注册编号已存在")


async def create_doctor(db: AsyncSession, data: DoctorCreate) -> Doctor:
    """创建医生。

    - 不传 clinic_id：个人账号（无 link，clinic_id 镜像为 NULL）
    - 传 clinic_id：自动建立第一条 primary link（与旧行为兼容）
    """
    await _ensure_unique(db, login_account=data.login_account, reg_no=data.reg_no)
    if data.clinic_id is not None:
        clinic = await db.get(Clinic, data.clinic_id)
        if clinic is None:
            raise NotFoundException("诊所不存在")

    specialty_tag_id = data.specialty_tag_id
    if specialty_tag_id is None:
        specialty_tag_id = await _default_specialty_tag_id(db)
    else:
        specialty_tag_id = await _validate_specialty_tag(db, specialty_tag_id)

    doctor = Doctor(
        clinic_id=data.clinic_id,
        doctor_name=data.doctor_name,
        doctor_name_en=data.doctor_name_en,
        reg_no=data.reg_no,
        email=data.email,
        login_account=data.login_account,
        password_hash=hash_password(data.password),
        signature_url=data.signature_url,
        specialty_tag_id=specialty_tag_id,
    )
    db.add(doctor)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("登录账号已存在") from exc

    if data.clinic_id is not None:
        await ensure_primary_clinic_link(
            db, doctor_id=doctor.id, clinic_id=data.clinic_id
        )
    return doctor


async def link_clinic(
    db: AsyncSession, doctor_id: int, clinic_id: int
) -> DoctorClinicLink:
    await get_doctor(db, doctor_id)
    return await clinic_link_service.link_clinic(
        db, doctor_id=doctor_id, clinic_id=clinic_id
    )


async def unlink_clinic(db: AsyncSession, doctor_id: int, clinic_id: int) -> None:
    await get_doctor(db, doctor_id)
    await clinic_link_service.unlink_clinic(
        db, doctor_id=doctor_id, clinic_id=clinic_id
    )


async def set_primary_clinic(
    db: AsyncSession, doctor_id: int, clinic_id: int
) -> DoctorClinicLink:
    await get_doctor(db, doctor_id)
    return await clinic_link_service.set_primary_clinic(
        db, doctor_id=doctor_id, clinic_id=clinic_id
    )


async def set_workspace_mode(db: AsyncSession, doctor_id: int, mode: str) -> Doctor:
    doctor = await get_doctor(db, doctor_id)
    link_count = await clinic_link_service.count_clinic_links(db, doctor_id)
    if link_count <= 1:
        raise AppException("仅关联多个诊所时可设置 workspace_mode")
    doctor.workspace_mode = mode
    await db.flush()
    return doctor


async def set_account_notes(
    db: AsyncSession,
    doctor_id: int,
    notes: str,
    *,
    notes_format: str | None = None,
) -> Doctor:
    doctor = await get_doctor(db, doctor_id)
    doctor.account_notes = notes
    if notes_format is not None:
        if notes_format not in NOTE_FORMATS:
            raise ValidationException("备注格式仅支持 html / markdown")
        doctor.account_notes_format = notes_format
    await db.flush()
    return doctor


async def list_doctors(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    clinic_id: int | None,
    keyword: str | None = None,
    linked: str | None = None,
) -> tuple[list[Doctor], int]:
    stmt = select(Doctor)
    count_stmt = select(func.count()).select_from(Doctor)
    if clinic_id:
        by_clinic = (
            select(DoctorClinicLink.doctor_id)
            .where(DoctorClinicLink.clinic_id == clinic_id)
            .scalar_subquery()
        )
        stmt = stmt.where(Doctor.id.in_(by_clinic))
        count_stmt = count_stmt.where(Doctor.id.in_(by_clinic))
    if linked in ("clinic", "individual"):
        has_link = (
            select(DoctorClinicLink.id)
            .where(DoctorClinicLink.doctor_id == Doctor.id)
            .exists()
        )
        if linked == "clinic":
            stmt = stmt.where(has_link)
            count_stmt = count_stmt.where(has_link)
        else:
            stmt = stmt.where(~has_link)
            count_stmt = count_stmt.where(~has_link)
    if keyword:
        like = f"%{keyword}%"
        stmt = stmt.outerjoin(Clinic, Doctor.clinic_id == Clinic.id)
        count_stmt = count_stmt.outerjoin(Clinic, Doctor.clinic_id == Clinic.id)
        cond = or_(
            Doctor.doctor_name.ilike(like),
            Doctor.doctor_name_en.ilike(like),
            Doctor.login_account.ilike(like),
            Doctor.reg_no.ilike(like),
            Doctor.email.ilike(like),
            Clinic.clinic_name.ilike(like),
            Clinic.clinic_name_en.ilike(like),
        )
        stmt = stmt.where(cond)
        count_stmt = count_stmt.where(cond)
    total = (await db.execute(count_stmt)).scalar_one()
    stmt = stmt.order_by(Doctor.id.desc()).offset((page - 1) * page_size).limit(page_size)
    return list((await db.execute(stmt)).scalars().all()), total


async def get_doctor(db: AsyncSession, doctor_id: int) -> Doctor:
    doctor = await db.get(Doctor, doctor_id)
    if not doctor:
        raise NotFoundException("医生不存在")
    return doctor


async def update_doctor(db: AsyncSession, doctor_id: int, data: DoctorUpdate) -> Doctor:
    doctor = await get_doctor(db, doctor_id)
    values = data.model_dump(exclude_unset=True)
    await _ensure_unique(
        db,
        login_account=values.get("login_account"),
        reg_no=values.get("reg_no"),
        exclude_id=doctor_id,
    )
    if "specialty_tag_id" in values:
        values["specialty_tag_id"] = await _validate_specialty_tag(
            db, values["specialty_tag_id"]
        )
    for key, value in values.items():
        setattr(doctor, key, value)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("登录账号已存在") from exc
    return doctor


async def set_status(db: AsyncSession, doctor_id: int, status: int) -> Doctor:
    doctor = await get_doctor(db, doctor_id)
    doctor.status = status
    await db.flush()
    return doctor


async def delete_doctor(db: AsyncSession, doctor_id: int) -> None:
    """删除医生。存在关联理赔单或 PDF 提取任务时拒绝删除。"""
    doctor = await get_doctor(db, doctor_id)
    claim_count = (
        await db.execute(
            select(func.count())
            .select_from(ClaimSubmission)
            .where(ClaimSubmission.doctor_id == doctor_id)
        )
    ).scalar_one()
    if claim_count:
        raise ConflictException("该医生存在关联理赔单，无法删除，可改为停用")

    extraction_count = (
        await db.execute(
            select(func.count())
            .select_from(ExtractionTask)
            .where(ExtractionTask.doctor_id == doctor_id)
        )
    ).scalar_one()
    if extraction_count:
        raise ConflictException("该医生存在关联 PDF 提取任务，无法删除，可改为停用")

    review_count = (
        await db.execute(
            select(func.count())
            .select_from(ExtractionReviewOutput)
            .where(ExtractionReviewOutput.reviewed_by_id == doctor_id)
        )
    ).scalar_one()
    if review_count:
        raise ConflictException("该医生存在关联审核记录，无法删除，可改为停用")

    links = list(
        (
            await db.execute(
                select(DoctorClinicLink).where(DoctorClinicLink.doctor_id == doctor_id)
            )
        )
        .scalars()
        .all()
    )
    for link in links:
        await db.delete(link)

    try:
        await db.delete(doctor)
        await db.flush()
    except IntegrityError as exc:
        raise ConflictException("该医生存在关联数据，无法删除，可改为停用") from exc


async def reset_password(db: AsyncSession, doctor_id: int) -> str:
    doctor = await get_doctor(db, doctor_id)
    temp = secrets.token_urlsafe(9)
    doctor.password_hash = hash_password(temp)
    doctor.registration_status = "unregistered"
    await db.flush()
    return temp
