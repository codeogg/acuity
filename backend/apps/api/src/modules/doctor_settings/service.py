import secrets

from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import NotFoundException, ValidationException
from src.core.idle_lock import (
    DEFAULT_IDLE_LOCK_MINUTES,
    validate_idle_lock_minutes,
)
from src.core.ui_language import (
    DEFAULT_UI_LANGUAGE,
    UiLanguage,
    normalize_ui_language,
    validate_ui_language,
)
from src.db.models import Clinic, Doctor
from src.modules.doctor_settings.schemas import DoctorSettingsOut, DoctorSettingsUpdate
from src.utils import storage

_SIGNATURE_MAX_BYTES = 2 * 1024 * 1024
_ALLOWED_SIGNATURE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
_ALLOWED_SIGNATURE_EXTS = {"png", "jpg", "jpeg", "webp"}


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


def resolve_ui_language(doctor: Doctor) -> UiLanguage:
    """读取医生预设界面语言；空/非法存量值回退默认。"""
    try:
        return normalize_ui_language(getattr(doctor, "language", None))
    except ValidationException:
        return DEFAULT_UI_LANGUAGE


def _to_settings_out(
    doctor: Doctor,
    *,
    idle_lock_minutes: int,
) -> DoctorSettingsOut:
    return DoctorSettingsOut(
        doctor_id=doctor.id,
        signature_image_url=doctor.signature_url,
        language=resolve_ui_language(doctor),
        idle_lock_minutes=idle_lock_minutes,
        delivery_default="download",
        trusted_devices=[],
    )


def _delete_signature_object(url: str | None) -> None:
    if not url or not url.startswith("/local-storage/"):
        return
    try:
        storage.delete_bytes(url)
    except Exception:
        # Best-effort cleanup; upload/clear must not fail on orphan objects.
        pass


def _validate_signature_url(url: str | None) -> str | None:
    """Allow clearing (null) or short storage proxy paths — never data URLs."""
    if url is None:
        return None
    value = url.strip()
    if not value:
        return None
    if value.startswith("data:"):
        raise ValidationException("请使用签名上传接口，勿直接提交图片数据")
    if len(value) > 255:
        raise ValidationException("签名地址过长")
    return value


async def get_settings(db: AsyncSession, doctor: Doctor) -> DoctorSettingsOut:
    idle_lock = await resolve_idle_lock_minutes(db, doctor)
    return _to_settings_out(doctor, idle_lock_minutes=idle_lock)


async def update_settings(
    db: AsyncSession, doctor: Doctor, data: DoctorSettingsUpdate
) -> DoctorSettingsOut:
    values = data.model_dump(exclude_unset=True)
    values.pop("remove_device_ids", None)

    if "signature_image_url" in values:
        next_url = _validate_signature_url(values.pop("signature_image_url"))
        if next_url != doctor.signature_url:
            _delete_signature_object(doctor.signature_url)
        doctor.signature_url = next_url

    if "idle_lock_minutes" in values and values["idle_lock_minutes"] is not None:
        doctor.idle_lock_minutes = validate_idle_lock_minutes(
            values.pop("idle_lock_minutes")
        )

    if "language" in values and values["language"] is not None:
        doctor.language = validate_ui_language(values.pop("language"))

    # delivery_default — 待后续表结构，暂忽略写入
    values.pop("delivery_default", None)

    await db.flush()
    idle_lock = await resolve_idle_lock_minutes(db, doctor)
    return _to_settings_out(doctor, idle_lock_minutes=idle_lock)


async def upload_signature(
    db: AsyncSession,
    doctor: Doctor,
    *,
    filename: str | None,
    content_type: str | None,
    content: bytes,
) -> DoctorSettingsOut:
    if not content:
        raise ValidationException("签名文件不能为空")
    if len(content) > _SIGNATURE_MAX_BYTES:
        raise ValidationException("签名图片不能超过 2MB")

    ext = (filename or "signature.png").rsplit(".", 1)[-1].lower()
    type_ok = (content_type or "").lower() in _ALLOWED_SIGNATURE_TYPES
    ext_ok = ext in _ALLOWED_SIGNATURE_EXTS
    if not type_ok and not ext_ok:
        raise ValidationException("仅支持 PNG / JPG / WEBP 图片格式")
    if not ext_ok:
        ext = {
            "image/png": "png",
            "image/jpeg": "jpg",
            "image/jpg": "jpg",
            "image/webp": "webp",
        }.get((content_type or "").lower(), "png")

    key = f"signatures/{doctor.id}/{secrets.token_hex(8)}.{ext}"
    url = storage.upload_bytes(
        content,
        key,
        content_type=content_type or f"image/{ext if ext != 'jpg' else 'jpeg'}",
    )

    previous = doctor.signature_url
    doctor.signature_url = url
    await db.flush()
    if previous and previous != url:
        _delete_signature_object(previous)

    idle_lock = await resolve_idle_lock_minutes(db, doctor)
    return _to_settings_out(doctor, idle_lock_minutes=idle_lock)
