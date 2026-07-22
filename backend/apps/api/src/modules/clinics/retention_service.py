from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import NotFoundException, ValidationException
from src.db.models import Clinic
from src.db.models.retention import ClinicDataRetention, RetentionPolicy
from src.modules.audit.service import log_audit
from src.modules.clinics.retention_schemas import (
    ClinicRetentionAuditOut,
    ClinicRetentionOut,
    ClinicRetentionOverrideRequest,
)


async def get_default_policy(db: AsyncSession) -> RetentionPolicy:
    row = (
        await db.execute(
            select(RetentionPolicy)
            .where(RetentionPolicy.is_default == 1)
            .order_by(RetentionPolicy.id.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundException("未配置全局默认保留政策")
    return row


async def get_effective_retention(
    db: AsyncSession, clinic_id: int
) -> ClinicRetentionOut:
    clinic = await db.get(Clinic, clinic_id)
    if clinic is None:
        raise NotFoundException("诊所不存在")

    default = await get_default_policy(db)
    override = await db.get(ClinicDataRetention, clinic_id)

    if override is not None and int(override.is_overridden or 0) == 1:
        if override.retention_days is None:
            raise ValidationException("覆写记录缺少保留天数")
        return ClinicRetentionOut(
            clinic_id=clinic_id,
            retention_days=int(override.retention_days),
            is_overridden=True,
            policy_name=None,
            overridden_at=override.overridden_at,
            overridden_by=override.overridden_by,
        )

    return ClinicRetentionOut(
        clinic_id=clinic_id,
        retention_days=int(default.retention_days),
        is_overridden=False,
        policy_name=default.policy_name,
        overridden_at=None,
        overridden_by=None,
    )


async def override_retention(
    db: AsyncSession,
    clinic_id: int,
    data: ClinicRetentionOverrideRequest,
    *,
    admin_id: int,
    ip_address: str | None,
) -> ClinicRetentionOut:
    clinic = await db.get(Clinic, clinic_id)
    if clinic is None:
        raise NotFoundException("诊所不存在")

    code_input = data.clinic_code_input.strip()
    if code_input != clinic.clinic_code:
        raise ValidationException(
            "诊所识别码与当前诊所不匹配，请贴上正确的诊所识别码后重试"
        )

    current = await get_effective_retention(db, clinic_id)
    now = datetime.now(timezone.utc)

    # Unified audit (append-only) + upsert override in the same transaction.
    await log_audit(
        db,
        action_type="retention_override",
        operator_id=admin_id,
        clinic_id=clinic_id,
        target_ref=clinic.clinic_code,
        mode=None,
        field_set="retention",
        detail={
            "clinic_code_input": code_input,
            "old_retention_days": current.retention_days,
            "new_retention_days": data.retention_days,
            "ip_address": ip_address,
        },
    )

    row = await db.get(ClinicDataRetention, clinic_id)
    if row is None:
        row = ClinicDataRetention(clinic_id=clinic_id)
        db.add(row)
    row.is_overridden = 1
    row.retention_days = data.retention_days
    row.overridden_by = admin_id
    row.overridden_at = now

    await db.flush()
    from src.modules.clinics.lifecycle import sync_lifecycle

    await sync_lifecycle(db, clinic)
    return await get_effective_retention(db, clinic_id)


async def list_retention_history(
    db: AsyncSession, clinic_id: int
) -> list[ClinicRetentionAuditOut]:
    """Retention history projected from unified audit_logs."""
    from src.db.models import AdminUser
    from src.db.models.audit import AuditLog
    from sqlalchemy.orm import aliased

    clinic = await db.get(Clinic, clinic_id)
    if clinic is None:
        raise NotFoundException("诊所不存在")

    operator = aliased(AdminUser)
    rows = (
        await db.execute(
            select(AuditLog, operator)
            .outerjoin(operator, operator.id == AuditLog.operator_id)
            .where(
                AuditLog.clinic_id == clinic_id,
                AuditLog.action_type == "retention_override",
            )
            .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        )
    ).all()

    out: list[ClinicRetentionAuditOut] = []
    for log, admin in rows:
        detail = log.detail or {}
        name = None
        if admin is not None:
            name = (admin.real_name or "").strip() or admin.username
        out.append(
            ClinicRetentionAuditOut(
                id=log.id,
                clinic_id=clinic_id,
                clinic_code_input=str(detail.get("clinic_code_input") or log.target_ref or ""),
                old_retention_days=int(detail.get("old_retention_days") or 0),
                new_retention_days=int(detail.get("new_retention_days") or 0),
                operated_by=log.operator_id,
                operator_name=name,
                operated_at=log.created_at,
                ip_address=(
                    str(detail["ip_address"])
                    if detail.get("ip_address") is not None
                    else None
                ),
            )
        )
    return out
