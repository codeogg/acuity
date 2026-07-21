"""医生-诊所关联：主诊所镜像同步。

doctor.clinic_id 始终镜像 doctor_clinic_link 中 is_primary=true 的 clinic_id；
无关联时置为 NULL。关联变更后必须调用 sync_doctor_primary_clinic。
同一医生至多一个 is_primary=true，由应用层在写 link 时保证。
"""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ConflictException, NotFoundException
from src.db.models import Clinic, Doctor, DoctorClinicLink


async def sync_doctor_primary_clinic(db: AsyncSession, doctor_id: int) -> None:
    """将 doctor.clinic_id 同步为当前主键关联诊所（无主键则 NULL）。"""
    doctor = await db.get(Doctor, doctor_id)
    if doctor is None:
        return

    primary = (
        await db.execute(
            select(DoctorClinicLink)
            .where(
                DoctorClinicLink.doctor_id == doctor_id,
                DoctorClinicLink.is_primary.is_(True),
            )
            .limit(1)
        )
    ).scalar_one_or_none()

    doctor.clinic_id = primary.clinic_id if primary is not None else None
    await db.flush()


async def ensure_primary_clinic_link(
    db: AsyncSession,
    *,
    doctor_id: int,
    clinic_id: int,
) -> DoctorClinicLink:
    """确保医生拥有指定诊所的主键关联（创建或升级为 primary）。

    会先清除该医生其他 link 的 is_primary，再写入/更新目标 link，最后 sync 镜像。
    """
    existing_links = list(
        (
            await db.execute(
                select(DoctorClinicLink).where(DoctorClinicLink.doctor_id == doctor_id)
            )
        )
        .scalars()
        .all()
    )

    target: DoctorClinicLink | None = None
    for link in existing_links:
        if link.clinic_id == clinic_id:
            target = link
            link.is_primary = True
        else:
            link.is_primary = False

    if target is None:
        target = DoctorClinicLink(
            doctor_id=doctor_id,
            clinic_id=clinic_id,
            is_primary=True,
        )
        db.add(target)

    await db.flush()
    await sync_doctor_primary_clinic(db, doctor_id)
    return target


async def _get_clinic_or_404(db: AsyncSession, clinic_id: int) -> Clinic:
    clinic = await db.get(Clinic, clinic_id)
    if clinic is None:
        raise NotFoundException("诊所不存在")
    return clinic


async def _get_link_or_404(
    db: AsyncSession, *, doctor_id: int, clinic_id: int
) -> DoctorClinicLink:
    link = (
        await db.execute(
            select(DoctorClinicLink).where(
                DoctorClinicLink.doctor_id == doctor_id,
                DoctorClinicLink.clinic_id == clinic_id,
            )
        )
    ).scalar_one_or_none()
    if link is None:
        raise NotFoundException("未关联该诊所")
    return link


async def count_clinic_links(db: AsyncSession, doctor_id: int) -> int:
    return (
        await db.execute(
            select(func.count())
            .select_from(DoctorClinicLink)
            .where(DoctorClinicLink.doctor_id == doctor_id)
        )
    ).scalar_one()


async def link_clinic(
    db: AsyncSession, *, doctor_id: int, clinic_id: int
) -> DoctorClinicLink:
    """关联诊所；若为第一条关联则自动设为 primary，并 sync 镜像。"""
    await _get_clinic_or_404(db, clinic_id)

    existing = (
        await db.execute(
            select(DoctorClinicLink).where(
                DoctorClinicLink.doctor_id == doctor_id,
                DoctorClinicLink.clinic_id == clinic_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise ConflictException("已关联该诊所")

    is_primary = (await count_clinic_links(db, doctor_id)) == 0
    link = DoctorClinicLink(
        doctor_id=doctor_id,
        clinic_id=clinic_id,
        is_primary=is_primary,
    )
    db.add(link)
    await db.flush()
    await sync_doctor_primary_clinic(db, doctor_id)
    return link


async def unlink_clinic(
    db: AsyncSession, *, doctor_id: int, clinic_id: int
) -> None:
    """解除关联；若解除的是 primary 且还有其他关联，则将 linked_at 最早的设为新 primary。"""
    link = await _get_link_or_404(db, doctor_id=doctor_id, clinic_id=clinic_id)
    was_primary = link.is_primary
    await db.delete(link)
    await db.flush()

    if was_primary:
        next_primary = (
            await db.execute(
                select(DoctorClinicLink)
                .where(DoctorClinicLink.doctor_id == doctor_id)
                .order_by(DoctorClinicLink.linked_at.asc(), DoctorClinicLink.id.asc())
                .limit(1)
            )
        ).scalar_one_or_none()
        if next_primary is not None:
            next_primary.is_primary = True
            await db.flush()

    await sync_doctor_primary_clinic(db, doctor_id)


async def set_primary_clinic(
    db: AsyncSession, *, doctor_id: int, clinic_id: int
) -> DoctorClinicLink:
    """将已关联诊所设为 primary，并清除其他 primary 标记。"""
    target = await _get_link_or_404(db, doctor_id=doctor_id, clinic_id=clinic_id)
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
        link.is_primary = link.id == target.id
    await db.flush()
    await sync_doctor_primary_clinic(db, doctor_id)
    return target


async def list_linked_clinic_ids(db: AsyncSession, doctor_id: int) -> list[int]:
    """返回关联诊所 id 列表，primary 在前，其余按 linked_at 排序。"""
    links = list(
        (
            await db.execute(
                select(DoctorClinicLink)
                .where(DoctorClinicLink.doctor_id == doctor_id)
                .order_by(
                    DoctorClinicLink.is_primary.desc(),
                    DoctorClinicLink.linked_at.asc(),
                    DoctorClinicLink.id.asc(),
                )
            )
        )
        .scalars()
        .all()
    )
    return [link.clinic_id for link in links]


async def map_linked_clinic_ids(
    db: AsyncSession, doctor_ids: list[int]
) -> dict[int, list[int]]:
    if not doctor_ids:
        return {}
    links = list(
        (
            await db.execute(
                select(DoctorClinicLink)
                .where(DoctorClinicLink.doctor_id.in_(doctor_ids))
                .order_by(
                    DoctorClinicLink.doctor_id.asc(),
                    DoctorClinicLink.is_primary.desc(),
                    DoctorClinicLink.linked_at.asc(),
                    DoctorClinicLink.id.asc(),
                )
            )
        )
        .scalars()
        .all()
    )
    result: dict[int, list[int]] = {doctor_id: [] for doctor_id in doctor_ids}
    for link in links:
        result[link.doctor_id].append(link.clinic_id)
    return result


async def set_doctor_clinics(
    db: AsyncSession, *, doctor_id: int, clinic_ids: list[int]
) -> list[int]:
    """原子替换医生的全部诊所关联；首个为 primary。"""
    unique_ids = list(dict.fromkeys(clinic_ids))
    for clinic_id in unique_ids:
        await _get_clinic_or_404(db, clinic_id)

    existing_links = list(
        (
            await db.execute(
                select(DoctorClinicLink).where(DoctorClinicLink.doctor_id == doctor_id)
            )
        )
        .scalars()
        .all()
    )
    for link in existing_links:
        await db.delete(link)
    await db.flush()

    for index, clinic_id in enumerate(unique_ids):
        db.add(
            DoctorClinicLink(
                doctor_id=doctor_id,
                clinic_id=clinic_id,
                is_primary=index == 0,
            )
        )
    await db.flush()
    await sync_doctor_primary_clinic(db, doctor_id)
    return unique_ids
