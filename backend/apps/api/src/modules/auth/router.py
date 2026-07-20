from fastapi import APIRouter, Response

from src.deps import CurrentUserDep, DbSession
from src.modules.auth import service
from src.modules.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    SuccessResponse,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: DbSession, response: Response) -> LoginResponse:
    result = await service.login(db, body.username, body.password)
    # 同时写入 httpOnly Cookie，供前端 middleware 做路由级校验
    response.set_cookie(
        key="access_token",
        value=result.access_token,
        httponly=True,
        samesite="lax",
        secure=False,  # 生产环境置 True（HTTPS）
        max_age=8 * 3600,
    )
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
