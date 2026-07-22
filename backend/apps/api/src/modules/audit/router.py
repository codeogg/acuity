from typing import Literal

from fastapi import APIRouter, Query

from src.deps import AdminDep, DbSession
from src.modules.audit import service
from src.modules.audit.schemas import AuditLogCreate, AuditLogOut
from src.modules.common import Page

router = APIRouter(prefix="/api/admin/audit-logs", tags=["admin:audit"])


@router.get("", response_model=Page[AuditLogOut])
async def list_audit_logs(
    db: DbSession,
    _: AdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    scope: Literal["global", "clinic"] | None = Query(
        None, description="global = 全部；clinic = 仅含 clinic_id 的事件"
    ),
    operator_id: int | None = None,
    action_type: str | None = None,
    clinic_id: int | None = None,
) -> Page[AuditLogOut]:
    items, total = await service.list_audit_logs(
        db,
        page=page,
        page_size=page_size,
        scope=scope,
        operator_id=operator_id,
        action_type=action_type,
        clinic_id=clinic_id,
    )
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.get("/{event_code}", response_model=AuditLogOut)
async def get_audit_log(
    event_code: str, db: DbSession, _: AdminDep
) -> AuditLogOut:
    return await service.get_audit_by_event_code(db, event_code)


@router.post("", response_model=AuditLogOut)
async def create_audit_log(
    body: AuditLogCreate, db: DbSession, admin: AdminDep
) -> AuditLogOut:
    """Record a client-driven audit event (PHI scrubbed server-side)."""
    row = await service.log_audit(
        db,
        action_type=body.action_type,
        operator_id=admin.id,
        clinic_id=body.clinic_id,
        target_ref=body.target_ref,
        mode=body.mode,
        field_set=body.field_set,
        detail=body.detail,
    )
    return await service.get_audit_by_event_code(db, row.event_code)
