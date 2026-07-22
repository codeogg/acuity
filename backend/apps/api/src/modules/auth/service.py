from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import (
    AuthException,
    ForbiddenException,
    NotFoundException,
    ValidationException,
)
from src.core.security import (
    create_access_token,
    create_mfa_pending_token,
    hash_password,
    verify_password,
)
from src.db.models import AdminUser, Clinic, Doctor
from src.modules.auth.schemas import (
    AuthClinicList,
    AuthClinicOption,
    ClinicSelectResponse,
    LoginResponse,
)
from src.modules.doctors.clinic_links import list_linked_clinic_ids


async def login(db: AsyncSession, username: str, password: str) -> LoginResponse:
    """统一登录：先查管理员，再查医生登录账号。"""
    admin = (
        await db.execute(select(AdminUser).where(AdminUser.username == username))
    ).scalar_one_or_none()
    if admin:
        if admin.status != 1 or not verify_password(password, admin.password_hash):
            raise AuthException("账号或密码错误")
        admin.last_login_at = datetime.now(UTC)
        token = create_access_token(user_id=admin.id, role=admin.role)
        return LoginResponse(
            access_token=token,
            role=admin.role,
            user_id=admin.id,
            display_name=admin.real_name or admin.username,
            mfa_required=False,
            mfa_enabled=False,
        )

    doctor = (
        await db.execute(select(Doctor).where(Doctor.login_account == username))
    ).scalar_one_or_none()
    if not doctor or not verify_password(password, doctor.password_hash):
        raise AuthException("账号或密码错误")
    if doctor.status != 1:
        raise ForbiddenException("账号已停用")
    if doctor.account_locked:
        raise ForbiddenException("账户已锁定，请联系管理员解锁")
    clinic = await db.get(Clinic, doctor.clinic_id) if doctor.clinic_id else None
    if not clinic or clinic.status != 1:
        raise ForbiddenException("所属诊所已停用")

    if doctor.mfa_enabled and doctor.mfa_secret:
        mfa_token = create_mfa_pending_token(
            user_id=doctor.id, role="DOCTOR", clinic_id=doctor.clinic_id
        )
        return LoginResponse(
            access_token=None,
            role="DOCTOR",
            user_id=doctor.id,
            clinic_id=doctor.clinic_id,
            display_name=doctor.doctor_name,
            mfa_required=True,
            mfa_token=mfa_token,
            mfa_enabled=True,
        )

    if doctor.mfa_enabled and not doctor.mfa_secret:
        # MFA policy on, not yet enrolled — force setup before issuing a session.
        mfa_token = create_mfa_pending_token(
            user_id=doctor.id, role="DOCTOR", clinic_id=doctor.clinic_id
        )
        return LoginResponse(
            access_token=None,
            role="DOCTOR",
            user_id=doctor.id,
            clinic_id=doctor.clinic_id,
            display_name=doctor.doctor_name,
            mfa_enrollment_required=True,
            mfa_token=mfa_token,
            mfa_enabled=True,
        )

    # 多诊所时先签发主诊所会话；前端再走 /auth/clinics 选择本次诊所并重签 JWT。
    token = create_access_token(
        user_id=doctor.id, role="DOCTOR", clinic_id=doctor.clinic_id
    )
    return LoginResponse(
        access_token=token,
        role="DOCTOR",
        user_id=doctor.id,
        clinic_id=doctor.clinic_id,
        display_name=doctor.doctor_name,
        mfa_enabled=False,
    )


async def list_account_clinics(db: AsyncSession, *, user_id: int, role: str) -> AuthClinicList:
    """当前身份可进入的诊所列表；非医生返回空列表。"""
    if role != "DOCTOR":
        return AuthClinicList(items=[], workspace_separation="separated")

    doctor = await db.get(Doctor, user_id)
    if not doctor or doctor.status != 1:
        raise ForbiddenException("需要医生身份")

    clinic_ids = await list_linked_clinic_ids(db, doctor.id)
    if not clinic_ids and doctor.clinic_id is not None:
        clinic_ids = [doctor.clinic_id]

    items: list[AuthClinicOption] = []
    if clinic_ids:
        clinics = list(
            (
                await db.execute(
                    select(Clinic).where(
                        Clinic.id.in_(clinic_ids),
                        Clinic.status == 1,
                    )
                )
            )
            .scalars()
            .all()
        )
        by_id = {clinic.id: clinic for clinic in clinics}
        for clinic_id in clinic_ids:
            clinic = by_id.get(clinic_id)
            if clinic is None:
                continue
            items.append(
                AuthClinicOption(
                    id=clinic.id,
                    clinic_code=clinic.clinic_code,
                    name_zh=clinic.clinic_name,
                    name_en=clinic.clinic_name_en or clinic.clinic_name,
                )
            )

    separation = (
        "merged" if doctor.workspace_mode == "merged" else "separated"
    )
    return AuthClinicList(items=items, workspace_separation=separation)


async def select_clinic(
    db: AsyncSession, *, user_id: int, role: str, clinic_id: int
) -> ClinicSelectResponse:
    """为本次会话选定诊所并重签 JWT（不改账号主诊所镜像）。"""
    if role != "DOCTOR":
        raise ForbiddenException("需要医生身份")

    doctor = await db.get(Doctor, user_id)
    if not doctor or doctor.status != 1:
        raise ForbiddenException("需要医生身份")

    linked_ids = await list_linked_clinic_ids(db, doctor.id)
    if not linked_ids and doctor.clinic_id is not None:
        linked_ids = [doctor.clinic_id]
    if clinic_id not in linked_ids:
        raise NotFoundException("诊所不存在或不属于此帐户")

    clinic = await db.get(Clinic, clinic_id)
    if not clinic or clinic.status != 1:
        raise ForbiddenException("所属诊所已停用")

    token = create_access_token(
        user_id=doctor.id, role="DOCTOR", clinic_id=clinic.id
    )
    return ClinicSelectResponse(
        success=True,
        access_token=token,
        role="DOCTOR",
        user_id=doctor.id,
        clinic_id=clinic.id,
        display_name=doctor.doctor_name,
    )


async def change_password(
    db: AsyncSession,
    *,
    user_id: int,
    role: str,
    current_password: str,
    new_password: str,
) -> None:
    if len(new_password) < 6:
        raise ValidationException("新密码不能少于 6 位")
    account = (
        await db.get(Doctor, user_id)
        if role == "DOCTOR"
        else await db.get(AdminUser, user_id)
    )
    if not account:
        raise AuthException("账号不存在")
    if not verify_password(current_password, account.password_hash):
        raise ValidationException("当前密码不正确")
    account.password_hash = hash_password(new_password)
    if role == "DOCTOR" and isinstance(account, Doctor):
        account.registration_status = "registered"
    await db.flush()


async def resolve_display_name(db: AsyncSession, user) -> str | None:
    if user.role == "DOCTOR":
        doctor = await db.get(Doctor, user.id)
        return doctor.doctor_name if doctor else None
    admin = await db.get(AdminUser, user.id)
    if admin:
        return admin.real_name or admin.username
    return None
