"""Doctor MFA enrollment, verification, and admin operations."""
from __future__ import annotations

import secrets
import string
from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import (
    ForbiddenException,
    NotFoundException,
    ValidationException,
)
from src.core.logging import get_logger
from src.core.mfa_crypto import decrypt_mfa_secret, encrypt_mfa_secret
from src.core.mfa_totp import (
    build_provisioning_uri,
    generate_totp_secret,
    qr_code_base64,
    verify_totp,
)
from src.core.security import create_access_token, hash_password
from src.db.models import Doctor, DoctorMfaBackupCode
from src.modules.audit.service import log_audit
from src.modules.auth.schemas import LoginResponse
from src.modules.mfa.cache import (
    clear_pending_enrollment_secret,
    pop_pending_enrollment_secret,
    store_pending_enrollment_secret,
)

logger = get_logger(__name__)

MFA_MAX_FAILED_ATTEMPTS = 5
BACKUP_CODE_COUNT = 10


def _generate_backup_codes() -> list[str]:
    alphabet = string.ascii_uppercase + string.digits
    codes: list[str] = []
    for _ in range(BACKUP_CODE_COUNT):
        part1 = "".join(secrets.choice(alphabet) for _ in range(4))
        part2 = "".join(secrets.choice(alphabet) for _ in range(4))
        codes.append(f"{part1}-{part2}")
    return codes


def _normalize_backup_code(code: str) -> str:
    return code.strip().upper().replace("-", "").replace(" ", "")


async def _get_doctor(db: AsyncSession, doctor_id: int) -> Doctor:
    doctor = await db.get(Doctor, doctor_id)
    if not doctor:
        raise NotFoundException("医生不存在")
    return doctor


async def enroll_init(db: AsyncSession, doctor_id: int) -> dict[str, str]:
    doctor = await _get_doctor(db, doctor_id)
    if doctor.mfa_enabled and doctor.mfa_secret:
        raise ValidationException("该医生已启用 MFA，请先重置后再绑定")

    secret = generate_totp_secret()
    await store_pending_enrollment_secret(doctor_id, secret)
    uri = build_provisioning_uri(secret=secret, account_name=doctor.login_account)
    return {
        "qr_code_base64": qr_code_base64(uri),
        "provisioning_uri": uri,
        "secret": secret,
    }


async def enroll_confirm(db: AsyncSession, doctor_id: int, code: str) -> list[str]:
    doctor = await _get_doctor(db, doctor_id)
    pending = await pop_pending_enrollment_secret(doctor_id)
    if not pending:
        raise ValidationException("绑定会话已过期，请重新发起 MFA 绑定")

    if not verify_totp(secret=pending, code=code):
        # Put secret back so user can retry within TTL
        await store_pending_enrollment_secret(doctor_id, pending)
        raise ValidationException("验证码不正确，请重试")

    doctor.mfa_secret = encrypt_mfa_secret(pending)
    doctor.mfa_enabled = True
    doctor.mfa_enrolled_at = datetime.now(UTC)

    await db.execute(
        delete(DoctorMfaBackupCode).where(DoctorMfaBackupCode.doctor_id == doctor_id)
    )
    plain_codes = _generate_backup_codes()
    for plain in plain_codes:
        db.add(
            DoctorMfaBackupCode(
                doctor_id=doctor_id,
                code_hash=hash_password(_normalize_backup_code(plain)),
            )
        )
    await db.flush()
    return plain_codes


async def enroll_confirm_and_login(
    db: AsyncSession, *, doctor_id: int, code: str
) -> LoginResponse:
    """Complete first-login enrollment and issue a session cookie payload."""
    backup_codes = await enroll_confirm(db, doctor_id, code)
    doctor = await _get_doctor(db, doctor_id)
    token = create_access_token(
        user_id=doctor.id, role="DOCTOR", clinic_id=doctor.clinic_id
    )
    return LoginResponse(
        access_token=token,
        role="DOCTOR",
        user_id=doctor.id,
        clinic_id=doctor.clinic_id,
        display_name=doctor.doctor_name,
        mfa_required=False,
        mfa_enabled=True,
        backup_codes=backup_codes,
    )


async def _doctor_login_response(doctor: Doctor) -> LoginResponse:
    token = create_access_token(
        user_id=doctor.id, role="DOCTOR", clinic_id=doctor.clinic_id
    )
    return LoginResponse(
        access_token=token,
        role="DOCTOR",
        user_id=doctor.id,
        clinic_id=doctor.clinic_id,
        display_name=doctor.doctor_name,
        mfa_required=False,
        mfa_enabled=doctor.mfa_enabled,
    )


async def verify_login_totp(
    db: AsyncSession, *, doctor_id: int, code: str
) -> LoginResponse:
    doctor = await _get_doctor(db, doctor_id)
    if doctor.account_locked:
        raise ForbiddenException("账户已锁定，请联系管理员解锁")
    if not doctor.mfa_enabled or not doctor.mfa_secret:
        raise ValidationException("该账户未启用 MFA")

    secret = decrypt_mfa_secret(doctor.mfa_secret)
    if not verify_totp(secret=secret, code=code):
        doctor.failed_mfa_attempts = int(doctor.failed_mfa_attempts or 0) + 1
        if doctor.failed_mfa_attempts >= MFA_MAX_FAILED_ATTEMPTS:
            doctor.account_locked = True
            await db.flush()
            raise ForbiddenException("连续验证失败次数过多，账户已锁定")
        await db.flush()
        remaining = MFA_MAX_FAILED_ATTEMPTS - doctor.failed_mfa_attempts
        raise ValidationException(f"验证码不正确，还可尝试 {remaining} 次")

    doctor.failed_mfa_attempts = 0
    await db.flush()
    return await _doctor_login_response(doctor)


async def verify_login_backup_code(
    db: AsyncSession, *, doctor_id: int, code: str
) -> LoginResponse:
    from src.core.security import verify_password

    doctor = await _get_doctor(db, doctor_id)
    if doctor.account_locked:
        raise ForbiddenException("账户已锁定，请联系管理员解锁")
    if not doctor.mfa_enabled:
        raise ValidationException("该账户未启用 MFA")

    normalized = _normalize_backup_code(code)
    if len(normalized) != 8:
        raise ValidationException("备用恢复码格式不正确")

    rows = list(
        (
            await db.execute(
                select(DoctorMfaBackupCode).where(
                    DoctorMfaBackupCode.doctor_id == doctor_id,
                    DoctorMfaBackupCode.is_used.is_(False),
                )
            )
        )
        .scalars()
        .all()
    )
    matched: DoctorMfaBackupCode | None = None
    for row in rows:
        if verify_password(normalized, row.code_hash):
            matched = row
            break

    if matched is None:
        doctor.failed_mfa_attempts = int(doctor.failed_mfa_attempts or 0) + 1
        if doctor.failed_mfa_attempts >= MFA_MAX_FAILED_ATTEMPTS:
            doctor.account_locked = True
            await db.flush()
            raise ForbiddenException("连续验证失败次数过多，账户已锁定")
        await db.flush()
        remaining = MFA_MAX_FAILED_ATTEMPTS - doctor.failed_mfa_attempts
        raise ValidationException(f"备用恢复码不正确，还可尝试 {remaining} 次")

    matched.is_used = True
    matched.used_at = datetime.now(UTC)
    doctor.failed_mfa_attempts = 0
    await db.flush()
    return await _doctor_login_response(doctor)


async def admin_reset_mfa(
    db: AsyncSession, *, doctor_id: int, operator_id: int
) -> None:
    doctor = await _get_doctor(db, doctor_id)
    doctor.mfa_enabled = False
    doctor.mfa_secret = None
    doctor.mfa_enrolled_at = None
    doctor.failed_mfa_attempts = 0
    await clear_pending_enrollment_secret(doctor_id)
    await db.execute(
        delete(DoctorMfaBackupCode).where(DoctorMfaBackupCode.doctor_id == doctor_id)
    )
    await log_audit(
        db,
        action_type="mfa_reset",
        operator_id=operator_id,
        clinic_id=doctor.clinic_id,
        target_ref=f"doctor:{doctor.login_account}",
        detail={"doctor_id": doctor.id},
    )
    await db.flush()


async def admin_unlock_account(
    db: AsyncSession, *, doctor_id: int, operator_id: int
) -> None:
    doctor = await _get_doctor(db, doctor_id)
    doctor.account_locked = False
    doctor.failed_mfa_attempts = 0
    await log_audit(
        db,
        action_type="account_unlock",
        operator_id=operator_id,
        clinic_id=doctor.clinic_id,
        target_ref=f"doctor:{doctor.login_account}",
        detail={"doctor_id": doctor.id},
    )
    await db.flush()


async def admin_resend_invite(
    db: AsyncSession, *, doctor_id: int, operator_id: int
) -> dict[str, str | None]:
    doctor = await _get_doctor(db, doctor_id)
    if doctor.registration_status != "unregistered":
        raise ValidationException("仅未注册账户可重发激活邀请")

    temp = secrets.token_urlsafe(9)
    doctor.password_hash = hash_password(temp)
    doctor.registration_status = "unregistered"

    await log_audit(
        db,
        action_type="invite_resend",
        operator_id=operator_id,
        clinic_id=doctor.clinic_id,
        target_ref=f"doctor:{doctor.login_account}",
        detail={"doctor_id": doctor.id, "email": doctor.email},
    )
    await db.flush()

    message = "激活邀请已发送"
    if doctor.email:
        logger.info(
            "invite_email_queued",
            doctor_id=doctor.id,
            email=doctor.email,
            login=doctor.login_account,
        )
        message = f"激活邀请已发送至 {doctor.email}"
    else:
        message = "医生未配置联络电邮，请手动提供临时密码"
        return {"message": message, "temp_password": temp}

    return {"message": message, "temp_password": None}
