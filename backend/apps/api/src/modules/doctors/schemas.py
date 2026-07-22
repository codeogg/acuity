from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

NoteFormat = Literal["markdown", "html"]
NOTE_FORMATS = frozenset({"html", "markdown"})


class DoctorCreate(BaseModel):
    clinic_id: int | None = None
    doctor_name: str
    doctor_name_en: str | None = None
    reg_no: str | None = None
    email: str | None = None
    login_account: str
    password: str
    signature_url: str | None = None
    specialty_tag_id: int | None = None


class DoctorUpdate(BaseModel):
    doctor_name: str | None = None
    doctor_name_en: str | None = None
    reg_no: str | None = None
    email: str | None = None
    login_account: str | None = None
    signature_url: str | None = None
    status: int | None = None
    specialty_tag_id: int | None = None


class DoctorStatusUpdate(BaseModel):
    status: int  # 0停用 1启用


class DoctorClinicLinkCreate(BaseModel):
    clinic_id: int


class DoctorClinicsSet(BaseModel):
    clinic_ids: list[int]


class DoctorClinicLinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    doctor_id: int
    clinic_id: int
    is_primary: bool
    linked_at: datetime


class WorkspaceModeUpdate(BaseModel):
    mode: Literal["separated", "merged"]


class AccountNotesUpdate(BaseModel):
    notes: str = Field(default="")
    notes_format: NoteFormat | None = None


class DoctorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int | None
    doctor_name: str
    doctor_name_en: str | None
    reg_no: str | None
    email: str | None
    signature_url: str | None
    login_account: str
    status: int
    workspace_mode: str
    account_notes: str | None
    account_notes_format: str
    specialty_tag_id: int
    specialty_label_en: str
    specialty_label_zh: str
    created_at: datetime


class DoctorAccountOut(DoctorOut):
    """DoctorOut + ADR 0041 account extensions for admin console."""

    clinic_ids: list[int]
    notes: str
    notes_format: str
    workspace_separation: Literal["separated", "merged"]
    mfa_enabled: bool = False


class ResetPasswordResponse(BaseModel):
    temp_password: str
