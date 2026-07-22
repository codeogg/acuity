from pydantic import BaseModel, Field


class MfaEnrollInitResponse(BaseModel):
    qr_code_base64: str
    provisioning_uri: str
    secret: str = Field(description="Base32 secret for manual entry (shown once during setup)")


class MfaEnrollConfirmRequest(BaseModel):
    code: str


class MfaEnrollConfirmResponse(BaseModel):
    success: bool = True
    backup_codes: list[str]


class MfaVerifyRequest(BaseModel):
    code: str
    mfa_token: str | None = None


class MfaBackupCodeVerifyRequest(BaseModel):
    code: str
    mfa_token: str | None = None


class AdminMfaActionResponse(BaseModel):
    success: bool = True


class InviteResendResponse(BaseModel):
    success: bool = True
    temp_password: str | None = None
    message: str
