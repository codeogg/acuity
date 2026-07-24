from typing import Literal

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str | None = None
    token_type: str = "bearer"
    role: str
    user_id: int
    clinic_id: int | None = None
    display_name: str | None = None
    mfa_required: bool = False
    mfa_enrollment_required: bool = False
    mfa_token: str | None = None
    mfa_enabled: bool = False
    backup_codes: list[str] | None = None


class MeResponse(BaseModel):
    user_id: int
    role: str
    clinic_id: int | None = None
    display_name: str | None = None
    username: str | None = None


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class SuccessResponse(BaseModel):
    """Uniform acknowledgement envelope used by action endpoints."""

    success: bool


class AuthClinicOption(BaseModel):
    id: int
    clinic_code: str
    name_zh: str
    name_en: str


class AuthClinicList(BaseModel):
    items: list[AuthClinicOption]
    workspace_separation: Literal["separated", "merged"]


class ClinicSelectRequest(BaseModel):
    clinic_id: int


class ClinicSelectResponse(LoginResponse):
    """Fresh clinic-scoped session for the selected clinic."""

    success: bool = True
