"""诊所导览步骤：批量初始化、单步完成、进度查询。"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import NotFoundException, ValidationException
from src.db.models.onboarding import ClinicOnboardingStep, OnboardingStepTemplate
from src.db.models.org import Clinic

STEP_PENDING = "pending"
STEP_COMPLETED = "completed"


async def seed_clinic_onboarding_steps(db: AsyncSession, clinic_id: int) -> int:
    """把模板全部步骤复制为该诊所的 pending 行（幂等，已存在则跳过）。"""
    templates = (
        await db.execute(
            select(OnboardingStepTemplate).order_by(OnboardingStepTemplate.sort_order)
        )
    ).scalars().all()
    if not templates:
        raise ValidationException("导览步骤模板未配置")

    existing = set(
        (
            await db.execute(
                select(ClinicOnboardingStep.step_code).where(
                    ClinicOnboardingStep.clinic_id == clinic_id
                )
            )
        )
        .scalars()
        .all()
    )

    inserted = 0
    for tmpl in templates:
        if tmpl.step_code in existing:
            continue
        db.add(
            ClinicOnboardingStep(
                clinic_id=clinic_id,
                step_code=tmpl.step_code,
                status=STEP_PENDING,
            )
        )
        inserted += 1

    await db.flush()
    return inserted


async def mark_step_completed(
    db: AsyncSession,
    clinic_id: int,
    step_code: str,
    *,
    completed_by: int | None = None,
) -> ClinicOnboardingStep:
    """将指定步骤 UPDATE 为 completed；不插入新行。"""
    tmpl = (
        await db.execute(
            select(OnboardingStepTemplate).where(
                OnboardingStepTemplate.step_code == step_code
            )
        )
    ).scalar_one_or_none()
    if tmpl is None:
        raise NotFoundException("导览步骤不存在")

    row = (
        await db.execute(
            select(ClinicOnboardingStep).where(
                ClinicOnboardingStep.clinic_id == clinic_id,
                ClinicOnboardingStep.step_code == step_code,
            )
        )
    ).scalar_one_or_none()
    if row is None:
        raise NotFoundException("该诊所尚未初始化导览步骤")

    if row.status == STEP_COMPLETED:
        return row

    row.status = STEP_COMPLETED
    row.completed_at = datetime.now(UTC)
    row.completed_by = completed_by
    await db.flush()
    return row


async def get_onboarding_progress(db: AsyncSession, clinic_id: int) -> dict:
    """实时统计已完成/总数，并附带步骤明细。"""
    clinic = await db.get(Clinic, clinic_id)
    if clinic is None:
        raise NotFoundException("诊所不存在")

    templates = (
        await db.execute(
            select(OnboardingStepTemplate).order_by(OnboardingStepTemplate.sort_order)
        )
    ).scalars().all()
    total = len(templates)

    rows = (
        await db.execute(
            select(ClinicOnboardingStep).where(
                ClinicOnboardingStep.clinic_id == clinic_id
            )
        )
    ).scalars().all()
    by_code = {r.step_code: r for r in rows}

    completed = 0
    steps: list[dict] = []
    current_step_code: str | None = None
    current_step_name: str | None = None
    current_step_name_en: str | None = None

    for tmpl in templates:
        row = by_code.get(tmpl.step_code)
        status = row.status if row else STEP_PENDING
        if status == STEP_COMPLETED:
            completed += 1
        elif current_step_code is None:
            current_step_code = tmpl.step_code
            current_step_name = tmpl.step_name
            current_step_name_en = tmpl.step_name_en
        steps.append(
            {
                "step_code": tmpl.step_code,
                "step_name": tmpl.step_name,
                "step_name_en": tmpl.step_name_en,
                "sort_order": tmpl.sort_order,
                "status": status,
                "completed_at": row.completed_at if row else None,
            }
        )

    return {
        "clinic_id": clinic_id,
        "lifecycle_status": clinic.lifecycle_status or "provisioning",
        "completed": completed,
        "total": total,
        "progress_label": f"{completed}/{total}",
        "all_completed": total > 0 and completed == total,
        "can_confirm_activate": (
            (clinic.lifecycle_status or "") == "onboarding"
            and total > 0
            and completed == total
        ),
        "current_step_code": current_step_code,
        "current_step_name": current_step_name,
        "current_step_name_en": current_step_name_en,
        "steps": steps,
    }


async def count_steps(db: AsyncSession, clinic_id: int) -> tuple[int, int]:
    total = (
        await db.execute(select(func.count()).select_from(OnboardingStepTemplate))
    ).scalar_one()
    completed = (
        await db.execute(
            select(func.count())
            .select_from(ClinicOnboardingStep)
            .where(
                ClinicOnboardingStep.clinic_id == clinic_id,
                ClinicOnboardingStep.status == STEP_COMPLETED,
            )
        )
    ).scalar_one()
    return int(completed), int(total)
