from fastapi import APIRouter, Query

from src.deps import AdminDep, DbSession
from src.modules.common import Page
from src.modules.tickets import service
from src.modules.tickets.schemas import (
    OnboardingQueueItemOut,
    TicketOut,
    TicketResolveRequest,
    TicketStatus,
    TicketUpdate,
)

router = APIRouter(tags=["admin:tickets"])


@router.get("/api/admin/tickets", response_model=Page[TicketOut])
async def list_tickets(
    db: DbSession,
    _: AdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: TicketStatus | None = None,
    owner: str | None = None,
) -> Page[TicketOut]:
    items, total = await service.list_tickets(
        db,
        page=page,
        page_size=page_size,
        status=status,
        owner=owner,
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/api/admin/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(ticket_id: str, db: DbSession, _: AdminDep) -> TicketOut:
    return await service.get_ticket(db, ticket_id)


@router.put("/api/admin/tickets/{ticket_id}", response_model=TicketOut)
async def update_ticket(
    ticket_id: str,
    body: TicketUpdate,
    db: DbSession,
    admin: AdminDep,
) -> TicketOut:
    return await service.update_ticket(
        db, ticket_id, body, operator_id=admin.id
    )


@router.post("/api/admin/tickets/{ticket_id}/resolve", response_model=TicketOut)
async def resolve_ticket(
    ticket_id: str,
    db: DbSession,
    admin: AdminDep,
    body: TicketResolveRequest | None = None,
) -> TicketOut:
    return await service.resolve_ticket(
        db,
        ticket_id,
        body or TicketResolveRequest(),
        operator_id=admin.id,
    )


@router.get("/api/admin/onboarding-queue", response_model=list[OnboardingQueueItemOut])
async def list_onboarding_queue(
    db: DbSession, _: AdminDep
) -> list[OnboardingQueueItemOut]:
    return await service.list_onboarding_queue(db)
