from fastapi import APIRouter, Response

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
    SuccessResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_COOKIE_MAX_AGE = 8 * 3600


def _set_access_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        samesite="lax",
        secure=False,  # 生产环境置 True（HTTPS）
        max_age=_COOKIE_MAX_AGE,
    )


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: DbSession, response: Response) -> LoginResponse:
    result = await service.login(db, body.username, body.password)
    # 同时写入 httpOnly Cookie，供前端 middleware 做路由级校验
    _set_access_cookie(response, result.access_token)
    return result


@router.post("/logout", response_model=SuccessResponse)
async def logout(response: Response) -> SuccessResponse:
    response.delete_cookie("access_token")
    return SuccessResponse(success=True)


@router.get("/me", response_model=MeResponse)
async def me(user: CurrentUserDep, db: DbSession) -> MeResponse:
    display_name = await service.resolve_display_name(db, user)
    return MeResponse(
        user_id=user.id,
        role=user.role,
        clinic_id=user.clinic_id,
        display_name=display_name,
    )


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
    _set_access_cookie(response, result.access_token)
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
