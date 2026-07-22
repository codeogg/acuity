"""MFA enrollment (admin) and admin security operations."""
from fastapi import APIRouter

from src.deps import AdminDep, DbSession, SuperAdminDep
from src.modules.mfa import service
from src.modules.mfa.schemas import (
    AdminMfaActionResponse,
    InviteResendResponse,
    MfaEnrollConfirmRequest,
    MfaEnrollConfirmResponse,
    MfaEnrollInitResponse,
)

router = APIRouter(prefix="/api/admin/doctors", tags=["admin:doctors:mfa"])


@router.post("/{doctor_id}/mfa/enroll/init", response_model=MfaEnrollInitResponse)
async def mfa_enroll_init(
    doctor_id: int, db: DbSession, _: AdminDep
) -> MfaEnrollInitResponse:
    data = await service.enroll_init(db, doctor_id)
    return MfaEnrollInitResponse.model_validate(data)


@router.post("/{doctor_id}/mfa/enroll/confirm", response_model=MfaEnrollConfirmResponse)
async def mfa_enroll_confirm(
    doctor_id: int,
    body: MfaEnrollConfirmRequest,
    db: DbSession,
    _: AdminDep,
) -> MfaEnrollConfirmResponse:
    codes = await service.enroll_confirm(db, doctor_id, body.code)
    return MfaEnrollConfirmResponse(backup_codes=codes)


@router.post("/{doctor_id}/mfa/reset", response_model=AdminMfaActionResponse)
async def mfa_reset(
    doctor_id: int,
    db: DbSession,
    admin: SuperAdminDep,
) -> AdminMfaActionResponse:
    await service.admin_reset_mfa(db, doctor_id=doctor_id, operator_id=admin.id)
    return AdminMfaActionResponse()


@router.post("/{doctor_id}/account/unlock", response_model=AdminMfaActionResponse)
async def account_unlock(
    doctor_id: int,
    db: DbSession,
    admin: SuperAdminDep,
) -> AdminMfaActionResponse:
    await service.admin_unlock_account(db, doctor_id=doctor_id, operator_id=admin.id)
    return AdminMfaActionResponse()


@router.post("/{doctor_id}/invite/resend", response_model=InviteResendResponse)
async def invite_resend(
    doctor_id: int,
    db: DbSession,
    admin: SuperAdminDep,
) -> InviteResendResponse:
    result = await service.admin_resend_invite(db, doctor_id=doctor_id, operator_id=admin.id)
    return InviteResendResponse(
        message=str(result["message"]),
        temp_password=result.get("temp_password"),  # type: ignore[arg-type]
    )
