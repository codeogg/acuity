from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: int
    clinic_id: int | None = None
    display_name: str | None = None


class MeResponse(BaseModel):
    user_id: int
    role: str
    clinic_id: int | None = None
    display_name: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class SuccessResponse(BaseModel):
    """Uniform acknowledgement envelope used by action endpoints."""

    success: bool
