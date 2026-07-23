from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.core.idle_lock import IDLE_LOCK_MAX, IDLE_LOCK_MIN
from src.core.ui_language import UiLanguage


class TrustedDeviceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    label: str
    last_seen_at: str


class DoctorSettingsOut(BaseModel):
    doctor_id: int
    signature_image_url: str | None
    language: UiLanguage
    idle_lock_minutes: int
    delivery_default: Literal["download", "email", "print"]
    trusted_devices: list[TrustedDeviceOut]


class DoctorSettingsUpdate(BaseModel):
    signature_image_url: str | None = None
    language: str | None = None
    idle_lock_minutes: int | None = Field(
        default=None,
        ge=IDLE_LOCK_MIN,
        le=IDLE_LOCK_MAX,
    )
    delivery_default: Literal["download", "email", "print"] | None = None
    remove_device_ids: list[str] = Field(default_factory=list)
