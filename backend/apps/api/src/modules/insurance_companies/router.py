import secrets

from fastapi import APIRouter, File, Query, UploadFile

from src.core.exceptions import ValidationException
from src.deps import AdminDep, DbSession
from src.modules.common import Page
from src.modules.insurance_companies import service
from src.modules.insurance_companies.schemas import (
    CompanyCreate,
    CompanyOut,
    CompanyStatusUpdate,
    CompanyUpdate,
    LogoUploadResponse,
)
from src.utils import storage

router = APIRouter(prefix="/api/admin/insurance-companies", tags=["admin:insurance"])

_ALLOWED_LOGO_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"}
_ALLOWED_LOGO_EXTS = {"png", "jpg", "jpeg", "webp", "svg"}


@router.post("", response_model=CompanyOut)
async def create_company(body: CompanyCreate, db: DbSession, _: AdminDep) -> CompanyOut:
    return CompanyOut.model_validate(await service.create_company(db, body))


@router.post("/logo", response_model=LogoUploadResponse)
async def upload_logo(
    db: DbSession, _: AdminDep, file: UploadFile = File(...)
) -> LogoUploadResponse:
    ext = (file.filename or "logo").rsplit(".", 1)[-1].lower()
    type_ok = file.content_type in _ALLOWED_LOGO_TYPES
    ext_ok = ext in _ALLOWED_LOGO_EXTS
    if not type_ok and not ext_ok:
        raise ValidationException("仅支持 PNG / JPG / WEBP / SVG 图片格式")
    content = await file.read()
    key = f"logos/{secrets.token_hex(8)}.{ext}"
    url = storage.upload_bytes(
        content,
        key,
        content_type=file.content_type or "application/octet-stream",
    )
    return LogoUploadResponse(url=url)


@router.get("", response_model=Page[CompanyOut])
async def list_companies(
    db: DbSession,
    _: AdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str | None = None,
) -> Page[CompanyOut]:
    items, total = await service.list_companies(
        db, page=page, page_size=page_size, keyword=keyword
    )
    return Page(
        items=[CompanyOut.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{company_id}", response_model=CompanyOut)
async def get_company(company_id: int, db: DbSession, _: AdminDep) -> CompanyOut:
    return CompanyOut.model_validate(await service.get_company(db, company_id))


@router.put("/{company_id}", response_model=CompanyOut)
async def update_company(
    company_id: int, body: CompanyUpdate, db: DbSession, _: AdminDep
) -> CompanyOut:
    return CompanyOut.model_validate(await service.update_company(db, company_id, body))


@router.patch("/{company_id}/status", response_model=CompanyOut)
async def update_status(
    company_id: int, body: CompanyStatusUpdate, db: DbSession, _: AdminDep
) -> CompanyOut:
    return CompanyOut.model_validate(await service.set_status(db, company_id, body.status))


@router.delete("/{company_id}", status_code=204)
async def delete_company(company_id: int, db: DbSession, _: AdminDep) -> None:
    await service.delete_company(db, company_id)
