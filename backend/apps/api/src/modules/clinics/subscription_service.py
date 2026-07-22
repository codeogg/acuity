from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.exceptions import NotFoundException, ValidationException
from src.db.models import Clinic, ClinicSubscription
from src.modules.clinics.subscription_schemas import (
    NOTE_FORMATS,
    PAYMENT_METHODS,
    PAYMENT_STATUSES,
    SUBSCRIPTION_STATUSES,
    ClinicSubscriptionNoteUpdate,
    ClinicSubscriptionOut,
    ClinicSubscriptionUpdate,
)


def subscription_to_out(row: ClinicSubscription) -> ClinicSubscriptionOut:
    return ClinicSubscriptionOut(
        clinic_id=row.clinic_id,
        subscription_status=row.subscription_status,
        plan_code=row.plan_code,
        price=row.price,
        currency=row.currency,
        payment_status=row.payment_status,
        payment_method=row.payment_method,
        note_content=row.note_content,
        note_format=row.note_format or "markdown",
        note_updated_by=row.note_updated_by,
        note_updated_at=row.note_updated_at,
        updated_at=row.updated_at,
    )


async def ensure_default_subscription(
    db: AsyncSession, clinic_id: int
) -> ClinicSubscription:
    """Create a trial subscription if missing (used on clinic create + lazy GET)."""
    existing = (
        await db.execute(
            select(ClinicSubscription).where(ClinicSubscription.clinic_id == clinic_id)
        )
    ).scalar_one_or_none()
    if existing:
        return existing
    row = ClinicSubscription(
        clinic_id=clinic_id,
        subscription_status="trial",
        currency="HKD",
        note_format="markdown",
    )
    db.add(row)
    await db.flush()
    return row


async def get_subscription(db: AsyncSession, clinic_id: int) -> ClinicSubscription:
    clinic = await db.get(Clinic, clinic_id)
    if clinic is None:
        raise NotFoundException("诊所不存在")
    return await ensure_default_subscription(db, clinic_id)


async def update_subscription(
    db: AsyncSession,
    clinic_id: int,
    data: ClinicSubscriptionUpdate,
    *,
    admin_id: int | None = None,
) -> ClinicSubscription:
    from src.modules.audit.service import log_audit

    row = await get_subscription(db, clinic_id)
    clinic = await db.get(Clinic, clinic_id)
    updates = data.model_dump(exclude_unset=True)
    if "subscription_status" in updates and updates["subscription_status"] is not None:
        if updates["subscription_status"] not in SUBSCRIPTION_STATUSES:
            raise ValidationException("无效的订阅状态")
    if "payment_status" in updates and updates["payment_status"] is not None:
        if updates["payment_status"] not in PAYMENT_STATUSES:
            raise ValidationException("无效的付款状态")
    if "payment_method" in updates and updates["payment_method"] is not None:
        if updates["payment_method"] not in PAYMENT_METHODS:
            raise ValidationException("无效的付款方式")
    if "plan_code" in updates and updates["plan_code"] is not None:
        updates["plan_code"] = updates["plan_code"].strip() or None
    if "currency" in updates and updates["currency"] is not None:
        currency = updates["currency"].strip().upper()
        if not currency:
            raise ValidationException("货币不能为空")
        updates["currency"] = currency
    if "price" in updates and updates["price"] is not None:
        price = Decimal(updates["price"])
        if price < 0:
            raise ValidationException("价格不能为负数")
        updates["price"] = price
    for key, value in updates.items():
        setattr(row, key, value)
    await db.flush()

    if admin_id is not None and updates:
        await log_audit(
            db,
            action_type="crm_billing_edit",
            operator_id=admin_id,
            clinic_id=clinic_id,
            target_ref=clinic.clinic_code if clinic else str(clinic_id),
            mode=None,
            field_set="subscription",
            detail={"fields": sorted(updates.keys())},
        )
    await db.refresh(row)
    return row


async def update_subscription_note(
    db: AsyncSession,
    clinic_id: int,
    data: ClinicSubscriptionNoteUpdate,
    *,
    admin_id: int,
) -> ClinicSubscription:
    from src.modules.audit.service import log_audit

    row = await get_subscription(db, clinic_id)
    clinic = await db.get(Clinic, clinic_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        raise ValidationException("备注内容或格式至少提供一项")
    if "note_format" in updates and updates["note_format"] is not None:
        if updates["note_format"] not in NOTE_FORMATS:
            raise ValidationException("备注格式仅支持 html / markdown")
        row.note_format = updates["note_format"]
    if "note_content" in updates:
        row.note_content = updates["note_content"]
    row.note_updated_by = admin_id
    row.note_updated_at = datetime.now(timezone.utc)
    await db.flush()

    await log_audit(
        db,
        action_type="crm_billing_edit",
        operator_id=admin_id,
        clinic_id=clinic_id,
        target_ref=clinic.clinic_code if clinic else str(clinic_id),
        mode=None,
        field_set="subscription.note",
        detail={
            "note_format": row.note_format,
            "note_updated": True,
            # Never store note body — may contain operational free text.
        },
    )
    await db.refresh(row)
    return row
