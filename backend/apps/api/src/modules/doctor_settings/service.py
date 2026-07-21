from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import NotFoundException
from src.db.models import Clinic, Doctor
from src.core.idle_lock import (
    DEFAULT_IDLE_LOCK_MINUTES,
    validate_idle_lock_minutes,
)
from src.modules.doctor_settings.schemas import DoctorSettingsOut, DoctorSettingsUpdate


async def get_doctor(db: AsyncSession, doctor_id: int) -> Doctor:
    doctor = await db.get(Doctor, doctor_id)
    if doctor is None:
        raise NotFoundException("医生不存在")
    return doctor


async def resolve_idle_lock_minutes(db: AsyncSession, doctor: Doctor) -> int:
    """医生个人值优先，否则继承主诊所默认值，最后回退系统默认。"""
    if doctor.idle_lock_minutes is not None:
        return doctor.idle_lock_minutes
    if doctor.clinic_id is not None:
        clinic = await db.get(Clinic, doctor.clinic_id)
        if clinic is not None:
            return clinic.idle_lock_minutes
    return DEFAULT_IDLE_LOCK_MINUTES


def _to_settings_out(doctor: Doctor, *, idle_lock_minutes: int) -> DoctorSettingsOut:
    return DoctorSettingsOut(
        doctor_id=doctor.id,
        signature_image_url=doctor.signature_url,
        language="zh-Hant-HK",
        idle_lock_minutes=idle_lock_minutes,
        delivery_default="download",
        trusted_devices=[],
    )


async def get_settings(db: AsyncSession, doctor: Doctor) -> DoctorSettingsOut:
    idle_lock = await resolve_idle_lock_minutes(db, doctor)
    return _to_settings_out(doctor, idle_lock_minutes=idle_lock)


async def update_settings(
    db: AsyncSession, doctor: Doctor, data: DoctorSettingsUpdate
) -> DoctorSettingsOut:
    values = data.model_dump(exclude_unset=True)
    values.pop("remove_device_ids", None)

    if "signature_image_url" in values:
        doctor.signature_url = values.pop("signature_image_url")

    if "idle_lock_minutes" in values and values["idle_lock_minutes"] is not None:
        doctor.idle_lock_minutes = validate_idle_lock_minutes(
            values.pop("idle_lock_minutes")
        )

    # language / delivery_default — 待后续表结构，暂忽略写入
    values.pop("language", None)
    values.pop("delivery_default", None)

    await db.flush()
    idle_lock = await resolve_idle_lock_minutes(db, doctor)
    return _to_settings_out(doctor, idle_lock_minutes=idle_lock)
