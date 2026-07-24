"""Clinic operational lifecycle: provisioning → onboarding → active.

Rules:
- New clinics start as ``provisioning`` (开通中 / 设定中).
- When the provisioning checklist is complete, advance to ``onboarding``
  and seed ``clinic_onboarding_step`` from the template (all pending).
- ``active`` is set only after manual confirm-activate when all 8 steps
  are completed — never auto-advance.
- Needs-attention is a separate manual flag (``clinic.is_flagged``), not a
  lifecycle value.
"""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import ValidationException
from src.db.models.org import Clinic, ClinicInsuranceCompany, DoctorClinicLink
from src.db.models.retention import ClinicDataRetention, RetentionPolicy

LIFECYCLE_PROVISIONING = "provisioning"
LIFECYCLE_ONBOARDING = "onboarding"
LIFECYCLE_ACTIVE = "active"

LIFECYCLE_STATUSES = frozenset(
    {LIFECYCLE_PROVISIONING, LIFECYCLE_ONBOARDING, LIFECYCLE_ACTIVE}
)

# Map lifecycle → console activation progress.
ACTIVATION_BY_LIFECYCLE = {
    LIFECYCLE_PROVISIONING: "setup",
    LIFECYCLE_ONBOARDING: "onboarding",
    LIFECYCLE_ACTIVE: "active",
}


async def provisioning_checklist_complete(db: AsyncSession, clinic: Clinic) -> bool:
    """开通 Tab 四项是否均已达成。"""
    basics = bool((clinic.clinic_name or "").strip() and (clinic.address or "").strip())
    residency = await _residency_and_retention_ready(db, clinic)
    if not (basics and residency):
        return False

    doctor_count = (
        await db.execute(
            select(func.count())
            .select_from(DoctorClinicLink)
            .where(DoctorClinicLink.clinic_id == clinic.id)
        )
    ).scalar_one()
    if doctor_count < 1:
        return False

    insurer_count = (
        await db.execute(
            select(func.count())
            .select_from(ClinicInsuranceCompany)
            .where(
                ClinicInsuranceCompany.clinic_id == clinic.id,
                ClinicInsuranceCompany.status == 1,
            )
        )
    ).scalar_one()
    return insurer_count >= 1


async def _residency_and_retention_ready(db: AsyncSession, clinic: Clinic) -> bool:
    """资料存放地已设定，且存在默认或诊所级保留策略。"""
    if not (clinic.data_region or "").strip():
        return False
    override = (
        await db.execute(
            select(ClinicDataRetention.clinic_id).where(
                ClinicDataRetention.clinic_id == clinic.id
            )
        )
    ).scalar_one_or_none()
    if override is not None:
        return True
    default = (
        await db.execute(
            select(RetentionPolicy.id).where(RetentionPolicy.is_default == 1).limit(1)
        )
    ).scalar_one_or_none()
    return default is not None


async def sync_lifecycle(db: AsyncSession, clinic: Clinic) -> Clinic:
    """Advance lifecycle when checklist gates are met. Never demotes; never
    auto-promotes to active (requires manual confirm-activate).
    """
    status = clinic.lifecycle_status or LIFECYCLE_PROVISIONING
    if status == LIFECYCLE_PROVISIONING and await provisioning_checklist_complete(
        db, clinic
    ):
        clinic.lifecycle_status = LIFECYCLE_ONBOARDING
        await db.flush()
        from src.modules.clinics.onboarding import seed_clinic_onboarding_steps

        await seed_clinic_onboarding_steps(db, clinic.id)
    return clinic


async def sync_lifecycle_by_id(db: AsyncSession, clinic_id: int) -> Clinic | None:
    clinic = await db.get(Clinic, clinic_id)
    if clinic is None:
        return None
    return await sync_lifecycle(db, clinic)


async def mark_active(
    db: AsyncSession,
    clinic: Clinic,
    *,
    operator_id: int | None = None,
) -> Clinic:
    """人工确认启用：8 步全部完成后才可从 onboarding → active。"""
    from src.modules.audit.service import log_audit
    from src.modules.clinics.onboarding import get_onboarding_progress

    if (clinic.lifecycle_status or "") != LIFECYCLE_ONBOARDING:
        raise ValidationException("仅「導入中」诊所可确认启用")

    progress = await get_onboarding_progress(db, clinic.id)
    if not progress["all_completed"]:
        raise ValidationException(
            f"导览尚未完成（{progress['progress_label']}），无法确认启用"
        )

    clinic.lifecycle_status = LIFECYCLE_ACTIVE
    await db.flush()

    if operator_id is not None:
        await log_audit(
            db,
            action_type="clinic_activate",
            operator_id=operator_id,
            clinic_id=clinic.id,
            target_ref=clinic.clinic_code,
            detail={
                "lifecycle": "onboarding→active",
                "progress": progress["progress_label"],
            },
        )
    return clinic
