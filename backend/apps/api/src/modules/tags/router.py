from fastapi import APIRouter, Query

from src.deps import AdminDep, DbSession
from src.modules.tags import service
from src.modules.tags.schemas import (
    SuccessResponse,
    TagCreate,
    TagKind,
    TagOut,
    TagRetireRequest,
    TagRetireResult,
    TagUpdate,
    TagVisibilityEntry,
    TagVisibilitySet,
)

router = APIRouter(prefix="/api/admin/tags", tags=["admin:tags"])


@router.get("", response_model=list[TagOut])
async def list_tags(
    db: DbSession,
    _: AdminDep,
    kind: TagKind | None = Query(None),
) -> list[TagOut]:
    items = await service.list_tags(db, kind=kind)
    return [TagOut.model_validate(t) for t in items]


@router.post("", response_model=TagOut)
async def create_tag(body: TagCreate, db: DbSession, _: AdminDep) -> TagOut:
    return TagOut.model_validate(await service.create_tag(db, body))


# Literal /visibility routes MUST be registered before /{tag_id} paths.
@router.get("/visibility", response_model=list[TagVisibilityEntry])
async def get_tag_visibility(
    db: DbSession,
    _: AdminDep,
    doctor_id: int | None = Query(None),
) -> list[TagVisibilityEntry]:
    return await service.list_visibility(db, doctor_id=doctor_id)


@router.put("/visibility", response_model=SuccessResponse)
async def set_tag_visibility(
    body: TagVisibilitySet, db: DbSession, _: AdminDep
) -> SuccessResponse:
    await service.set_visibility(db, body.entries)
    return SuccessResponse(success=True)


@router.put("/{tag_id}", response_model=TagOut)
async def update_tag(
    tag_id: int, body: TagUpdate, db: DbSession, _: AdminDep
) -> TagOut:
    return TagOut.model_validate(await service.update_tag(db, tag_id, body))


@router.post("/{tag_id}/retire", response_model=TagRetireResult)
async def retire_tag(
    tag_id: int, body: TagRetireRequest, db: DbSession, _: AdminDep
) -> TagRetireResult:
    return await service.retire_tag(db, tag_id, remap_to_tag_id=body.remap_to_tag_id)
