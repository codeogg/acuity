from fastapi import APIRouter, Query, Response

from src.core.session_cookies import clear_access_cookie, set_access_cookie
from src.deps import AdminDep, CurrentUserDep, DbSession, DoctorDep
from src.modules.impersonation import entry as entry_service
from src.modules.impersonation import notify, service
from src.modules.impersonation.access import ImpersonationAccess, ImpersonationAccessLevel
from src.modules.impersonation.route import ImpersonationAuditRoute
from src.modules.impersonation.schemas import (
    ImpersonationEndRequest,
    ImpersonationEntryRequest,
    ImpersonationEntryResponse,
    ImpersonationSessionOut,
    ImpersonationSessionStateOut,
    ImpersonationStartRequest,
    SuccessResponse,
    SupportAccessAcknowledgeRequest,
    SupportAccessPendingOut,
)

router = APIRouter(tags=["admin:impersonation"], route_class=ImpersonationAuditRoute)


@router.post("/api/admin/impersonation/start", response_model=ImpersonationSessionOut)
async def start_impersonation(
    body: ImpersonationStartRequest,
    db: DbSession,
    admin: AdminDep,
) -> ImpersonationSessionOut:
    return await service.start_impersonation(db, body, operator_id=admin.id)


@router.post("/api/admin/impersonation/end", response_model=SuccessResponse)
async def end_impersonation(
    body: ImpersonationEndRequest,
    db: DbSession,
    admin: AdminDep,
) -> SuccessResponse:
    await service.end_impersonation(db, body, operator_id=admin.id)
    return SuccessResponse(success=True)


@router.get(
    "/api/admin/impersonation/session",
    response_model=ImpersonationSessionStateOut,
)
async def get_impersonation_session(
    db: DbSession,
    _: AdminDep,
    clinic_id: int = Query(...),
    doctor_id: int = Query(...),
) -> ImpersonationSessionStateOut:
    return await service.get_impersonation_session(
        db, clinic_id=clinic_id, doctor_id=doctor_id
    )


@router.post(
    "/api/doctor/session/impersonation-entry",
    response_model=ImpersonationEntryResponse,
    tags=["doctor:impersonation"],
)
async def impersonation_entry(
    body: ImpersonationEntryRequest,
    db: DbSession,
    response: Response,
) -> ImpersonationEntryResponse:
    """模拟入口：独立于 /api/auth/login，不校验医生密码。"""
    result = await entry_service.enter_impersonation_session(db, entry_token=body.token)
    # 只写医生端 Cookie，绝不动运营端 admin_access_token
    set_access_cookie(response, result.access_token, surface="doctor")
    return result


@router.post(
    "/api/doctor/session/impersonation-exit",
    response_model=SuccessResponse,
    tags=["doctor:impersonation"],
)
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def impersonation_exit(
    db: DbSession,
    user: CurrentUserDep,
    response: Response,
) -> SuccessResponse:
    """医生端横幅「退出模拟」：结束会话并清除医生端 Cookie（不影响运营端）。"""
    if user.impersonation:
        await entry_service.exit_impersonation_session(
            db, impersonation=user.impersonation
        )
    clear_access_cookie(response, surface="doctor")
    return SuccessResponse(success=True)


@router.get(
    "/api/doctor/support-access/pending",
    response_model=SupportAccessPendingOut,
    tags=["doctor:support-access"],
)
@ImpersonationAccess(ImpersonationAccessLevel.FORBIDDEN)
async def list_pending_support_access(
    db: DbSession,
    doctor: DoctorDep,
) -> SupportAccessPendingOut:
    """登录成功后由前端异步调用：未确认的已结束模拟记录；返回时写 doctor_notified_at。

    不耦合 /auth/login；覆盖医生全部绑定诊所，多条不合并。
    """
    return await notify.list_pending_support_access(db, doctor_id=doctor.id)


@router.post(
    "/api/doctor/support-access/acknowledge",
    response_model=SuccessResponse,
    tags=["doctor:support-access"],
)
@ImpersonationAccess(ImpersonationAccessLevel.FORBIDDEN)
async def acknowledge_support_access(
    body: SupportAccessAcknowledgeRequest,
    db: DbSession,
    doctor: DoctorDep,
) -> SuccessResponse:
    """医生确认知晓某条模拟记录，回写 doctor_acknowledged_at。"""
    await notify.acknowledge_support_access(
        db, doctor_id=doctor.id, session_id=body.session_id
    )
    return SuccessResponse(success=True)
