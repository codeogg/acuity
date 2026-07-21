from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DoctorCreate(BaseModel):
    clinic_id: int | None = None
    doctor_name: str
    doctor_name_en: str | None = None
    reg_no: str | None = None
    login_account: str
    password: str
    signature_url: str | None = None


class DoctorUpdate(BaseModel):
    doctor_name: str | None = None
    doctor_name_en: str | None = None
    reg_no: str | None = None
    login_account: str | None = None
    signature_url: str | None = None
    status: int | None = None


class DoctorStatusUpdate(BaseModel):
    status: int  # 0停用 1启用


class DoctorClinicLinkCreate(BaseModel):
    clinic_id: int


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


class DoctorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int | None
    doctor_name: str
    doctor_name_en: str | None
    reg_no: str | None
    signature_url: str | None
    login_account: str
    status: int
    workspace_mode: str
    account_notes: str | None
    created_at: datetime


class ResetPasswordResponse(BaseModel):
    temp_password: str
