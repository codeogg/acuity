from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DoctorCreate(BaseModel):
    clinic_id: int
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


class DoctorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    clinic_id: int
    doctor_name: str
    doctor_name_en: str | None
    reg_no: str | None
    signature_url: str | None
    login_account: str
    status: int
    created_at: datetime


class ResetPasswordResponse(BaseModel):
    temp_password: str
