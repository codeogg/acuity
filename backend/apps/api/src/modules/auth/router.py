from fastapi import APIRouter, Request, Response

from src.core.exceptions import AuthException
from src.core.security import decode_mfa_pending_token
from src.core.session_cookies import (
    clear_access_cookie,
    extract_access_token,
    resolve_surface,
    set_access_cookie,
)
from src.deps import CurrentUserDep, DbSession
from src.modules.auth import service
from src.modules.auth.schemas import (
    AuthClinicList,
    ChangePasswordRequest,
    ClinicSelectRequest,
    ClinicSelectResponse,
    LoginRequest,
    LoginResponse,
    MeResponse,
    ProfileUpdateRequest,
    SuccessResponse,
)
from src.modules.mfa import service as mfa_service
from src.modules.mfa.schemas import (
    MfaBackupCodeVerifyRequest,
    MfaEnrollConfirmRequest,
    MfaEnrollInitRequest,
    MfaEnrollInitResponse,
    MfaVerifyRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: DbSession, response: Response) -> LoginResponse:
    result = await service.login(db, body.username, body.password)
    # MFA 待验证时不写入 session cookie，待 /auth/mfa/verify 成功后签发
    if result.access_token:
        set_access_cookie(response, result.access_token, role=result.role)
    return result


@router.post("/logout", response_model=SuccessResponse)
async def logout(request: Request, response: Response) -> SuccessResponse:
    surface = resolve_surface(request) or "doctor"
    clear_access_cookie(response, surface=surface)
    return SuccessResponse(success=True)


@router.get("/me", response_model=MeResponse)
async def me(user: CurrentUserDep, db: DbSession) -> MeResponse:
    return await service.get_me(db, user)


@router.patch("/me", response_model=MeResponse)
async def update_me(
    body: ProfileUpdateRequest,
    user: CurrentUserDep,
    db: DbSession,
) -> MeResponse:
    return await service.update_profile(db, user, display_name=body.display_name)


@router.get("/clinics", response_model=AuthClinicList)
async def list_account_clinics(user: CurrentUserDep, db: DbSession) -> AuthClinicList:
    """登录后列出本身份可进入的诊所；多诊所且 separated 时前端展示选择器。"""
    return await service.list_account_clinics(db, user_id=user.id, role=user.role)


@router.post("/clinics/select", response_model=ClinicSelectResponse)
async def select_clinic(
    body: ClinicSelectRequest,
    user: CurrentUserDep,
    db: DbSession,
    response: Response,
) -> ClinicSelectResponse:
    """选定本次会话诊所并重签 cookie；后续 /api/doctor/** 按 JWT clinic_id 隔离。"""
    result = await service.select_clinic(
        db, user_id=user.id, role=user.role, clinic_id=body.clinic_id
    )
    set_access_cookie(response, result.access_token, role=result.role)
    return result


@router.post("/change-password", response_model=SuccessResponse, status_code=200)
async def change_password(
    body: ChangePasswordRequest,
    user: CurrentUserDep,
    db: DbSession,
) -> SuccessResponse:
    await service.change_password(
        db,
        user_id=user.id,
        role=user.role,
        current_password=body.current_password,
        new_password=body.new_password,
    )
    return SuccessResponse(success=True)


def _extract_mfa_token(body_token: str | None, request: Request) -> str:
    if body_token:
        return body_token
    token = extract_access_token(request)
    if token:
        return token
    raise AuthException("缺少 MFA 会话凭证")


@router.post("/mfa/enroll/init", response_model=MfaEnrollInitResponse)
async def mfa_enroll_init(
    body: MfaEnrollInitRequest,
    db: DbSession,
    request: Request,
) -> MfaEnrollInitResponse:
    """First-login MFA setup — requires the pending mfa_token from /auth/login."""
    token = _extract_mfa_token(body.mfa_token, request)
    payload = decode_mfa_pending_token(token)
    if payload.get("role") != "DOCTOR":
        raise AuthException("无效的 MFA 会话")
    data = await mfa_service.enroll_init(db, int(payload["sub"]))
    return MfaEnrollInitResponse.model_validate(data)


@router.post("/mfa/enroll/confirm", response_model=LoginResponse)
async def mfa_enroll_confirm(
    body: MfaEnrollConfirmRequest,
    db: DbSession,
    response: Response,
    request: Request,
) -> LoginResponse:
    """Confirm TOTP during first-login enrollment; issues session + backup codes."""
    token = _extract_mfa_token(body.mfa_token, request)
    payload = decode_mfa_pending_token(token)
    if payload.get("role") != "DOCTOR":
        raise AuthException("无效的 MFA 会话")
    result = await mfa_service.enroll_confirm_and_login(
        db, doctor_id=int(payload["sub"]), code=body.code
    )
    if result.access_token:
        set_access_cookie(response, result.access_token, role=result.role)
    return result


@router.post("/mfa/verify", response_model=LoginResponse)
async def verify_mfa(
    body: MfaVerifyRequest,
    db: DbSession,
    response: Response,
    request: Request,
) -> LoginResponse:
    token = _extract_mfa_token(body.mfa_token, request)
    payload = decode_mfa_pending_token(token)
    if payload.get("role") != "DOCTOR":
        raise AuthException("无效的 MFA 会话")
    result = await mfa_service.verify_login_totp(
        db, doctor_id=int(payload["sub"]), code=body.code
    )
    if result.access_token:
        set_access_cookie(response, result.access_token, role=result.role)
    return result


@router.post("/mfa/verify-backup-code", response_model=LoginResponse)
async def verify_mfa_backup_code(
    body: MfaBackupCodeVerifyRequest,
    db: DbSession,
    response: Response,
    request: Request,
) -> LoginResponse:
    token = _extract_mfa_token(body.mfa_token, request)
    payload = decode_mfa_pending_token(token)
    if payload.get("role") != "DOCTOR":
        raise AuthException("无效的 MFA 会话")
    result = await mfa_service.verify_login_backup_code(
        db, doctor_id=int(payload["sub"]), code=body.code
    )
    if result.access_token:
        set_access_cookie(response, result.access_token, role=result.role)
    return result
