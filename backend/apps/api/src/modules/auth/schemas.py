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


class MeImpersonationContext(BaseModel):
    """模拟业务会话上下文（仅 typ=impersonation_session 时出现）。"""

    session_id: int
    operator_id: int
    doctor_id: int
    clinic_id: int
    mode: Literal["view", "proxy"]
    # 身份展示：操作人 vs 被模拟医生（不得混淆）
    operator: str | None = None
    doctor: str | None = None


class MeResponse(BaseModel):
    user_id: int
    role: str
    clinic_id: int | None = None
    display_name: str | None = None
    username: str | None = None
    impersonation: MeImpersonationContext | None = None


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
