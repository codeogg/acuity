from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.exceptions import NotFoundException, ValidationException
from src.db.models import AdminUser, Clinic
from src.db.models.tickets import OpsTicket, OpsTicketNote
from src.modules.tickets.schemas import (
    OnboardingQueueItemOut,
    TicketOut,
    TicketResolveRequest,
    TicketStatus,
    TicketUpdate,
)

_VALID_STATUSES: frozenset[str] = frozenset({"open", "in-progress", "resolved"})


def _to_ticket_out(ticket: OpsTicket) -> TicketOut:
    return TicketOut(
        id=ticket.ticket_no,
        clinic_id=ticket.clinic_id,
        subject_zh=ticket.subject_zh,
        subject_en=ticket.subject_en,
        status=ticket.status,  # type: ignore[arg-type]
        owner=ticket.owner,
        updated_at=ticket.updated_at,
        notes=[n.body for n in ticket.notes],
    )


async def _get_ticket_row(db: AsyncSession, ticket_id: str) -> OpsTicket:
    result = await db.execute(
        select(OpsTicket)
        .options(selectinload(OpsTicket.notes))
        .where(OpsTicket.ticket_no == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if ticket is None:
        raise NotFoundException("工单不存在")
    return ticket


async def _resolve_owner_admin_id(db: AsyncSession, owner: str | None) -> int | None:
    if not owner or not owner.strip():
        return None
    result = await db.execute(
        select(AdminUser.id).where(AdminUser.real_name == owner.strip()).limit(1)
    )
    return result.scalar_one_or_none()


async def list_tickets(
    db: AsyncSession,
    *,
    page: int,
    page_size: int,
    status: TicketStatus | None = None,
    owner: str | None = None,
) -> tuple[list[TicketOut], int]:
    filters = []
    if status is not None:
        filters.append(OpsTicket.status == status)
    if owner is not None:
        if owner == "" or owner.lower() == "none":
            filters.append(OpsTicket.owner.is_(None))
        else:
            filters.append(OpsTicket.owner == owner)

    count_stmt = select(func.count()).select_from(OpsTicket)
    list_stmt = (
        select(OpsTicket)
        .options(selectinload(OpsTicket.notes))
        .order_by(OpsTicket.updated_at.asc(), OpsTicket.id.asc())
    )
    for f in filters:
        count_stmt = count_stmt.where(f)
        list_stmt = list_stmt.where(f)

    total = int((await db.execute(count_stmt)).scalar_one())
    rows = (
        await db.execute(list_stmt.offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()
    return [_to_ticket_out(r) for r in rows], total


async def get_ticket(db: AsyncSession, ticket_id: str) -> TicketOut:
    return _to_ticket_out(await _get_ticket_row(db, ticket_id))


async def update_ticket(
    db: AsyncSession,
    ticket_id: str,
    body: TicketUpdate,
    *,
    operator_id: int | None = None,
) -> TicketOut:
    ticket = await _get_ticket_row(db, ticket_id)
    values = body.model_dump(exclude_unset=True)

    if "status" in values and values["status"] is not None:
        status = values["status"]
        if status not in _VALID_STATUSES:
            raise ValidationException("无效的工单状态")
        ticket.status = status
        if status == "resolved":
            ticket.resolved_at = datetime.now(UTC)
            ticket.resolved_by = operator_id
        else:
            ticket.resolved_at = None
            ticket.resolved_by = None

    if "owner" in values:
        owner = values["owner"]
        if owner is not None and not str(owner).strip():
            owner = None
        ticket.owner = owner.strip() if isinstance(owner, str) and owner else owner
        ticket.owner_admin_id = await _resolve_owner_admin_id(db, ticket.owner)

    if values.get("add_note"):
        note_body = str(values["add_note"]).strip()
        if note_body:
            db.add(
                OpsTicketNote(
                    ticket_id=ticket.id,
                    body=note_body,
                    note_kind="comment",
                    created_by=operator_id,
                )
            )

    ticket.updated_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(ticket, attribute_names=["notes"])
    return _to_ticket_out(ticket)


async def resolve_ticket(
    db: AsyncSession,
    ticket_id: str,
    body: TicketResolveRequest,
    *,
    operator_id: int | None = None,
) -> TicketOut:
    ticket = await _get_ticket_row(db, ticket_id)
    ticket.status = "resolved"
    ticket.resolved_at = datetime.now(UTC)
    ticket.resolved_by = operator_id
    ticket.updated_at = datetime.now(UTC)

    if body.resolution_note and body.resolution_note.strip():
        db.add(
            OpsTicketNote(
                ticket_id=ticket.id,
                body=body.resolution_note.strip(),
                note_kind="resolution",
                created_by=operator_id,
            )
        )

    await db.flush()
    await db.refresh(ticket, attribute_names=["notes"])
    return _to_ticket_out(ticket)


async def list_onboarding_queue(db: AsyncSession) -> list[OnboardingQueueItemOut]:
    """导入队列：僅導覽中诊所，进度来自 clinic_onboarding_step。"""
    from src.db.models.onboarding import ClinicOnboardingStep
    from src.modules.clinics.onboarding import (
        get_onboarding_progress,
        seed_clinic_onboarding_steps,
    )

    clinics = (
        await db.execute(
            select(Clinic)
            .where(Clinic.lifecycle_status == "onboarding")
            .order_by(Clinic.updated_at.asc(), Clinic.id.asc())
        )
    ).scalars().all()

    items: list[OnboardingQueueItemOut] = []
    for clinic in clinics:
        step_count = (
            await db.execute(
                select(func.count())
                .select_from(ClinicOnboardingStep)
                .where(ClinicOnboardingStep.clinic_id == clinic.id)
            )
        ).scalar_one()
        if int(step_count) == 0:
            await seed_clinic_onboarding_steps(db, clinic.id)

        progress = await get_onboarding_progress(db, clinic.id)
        next_zh = progress["current_step_name"] or "待確認啟用"
        next_en = progress["current_step_name_en"] or "Confirm activation"
        if progress["all_completed"]:
            step_num = progress["total"] or 8
        else:
            step_num = int(progress["completed"]) + 1
        items.append(
            OnboardingQueueItemOut(
                clinic_id=clinic.id,
                next_step_zh=next_zh,
                next_step_en=next_en,
                progress_step=max(1, step_num),
                progress_total=progress["total"] or 8,
                updated_at=clinic.updated_at,
            )
        )
    return items


async def next_ticket_no(db: AsyncSession) -> str:
    seq = (await db.execute(text("SELECT nextval('ops_ticket_no_seq')"))).scalar_one()
    return f"TK-{int(seq)}"
