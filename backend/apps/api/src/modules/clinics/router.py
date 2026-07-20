from fastapi import APIRouter, Query

from src.deps import AdminDep, DbSession
from src.modules.clinics import service
from src.modules.clinics.schemas import (
    ClinicConfigOverview,
    ClinicCreate,
    ClinicInsuranceUpdate,
    ClinicOut,
    ClinicStatusUpdate,
    ClinicTemplatesSet,
    ClinicTemplatesSetResult,
    ClinicUpdate,
    CompanyEnableResult,
    CompanyEnableUpdate,
    TemplateEnableResult,
    TemplateEnableUpdate,
)
from src.modules.common import Page

router = APIRouter(prefix="/api/admin/clinics", tags=["admin:clinics"])


@router.post("", response_model=ClinicOut)
async def create_clinic(body: ClinicCreate, db: DbSession, _: AdminDep) -> ClinicOut:
    clinic = await service.create_clinic(db, body)
    return ClinicOut.model_validate(clinic)


@router.get("", response_model=Page[ClinicOut])
async def list_clinics(
    db: DbSession,
    _: AdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: str | None = None,
) -> Page[ClinicOut]:
    items, total = await service.list_clinics(
        db, page=page, page_size=page_size, keyword=keyword
    )
    return Page(
        items=[ClinicOut.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{clinic_id}", response_model=ClinicOut)
async def get_clinic(clinic_id: int, db: DbSession, _: AdminDep) -> ClinicOut:
    return ClinicOut.model_validate(await service.get_clinic(db, clinic_id))


@router.put("/{clinic_id}", response_model=ClinicOut)
async def update_clinic(
    clinic_id: int, body: ClinicUpdate, db: DbSession, _: AdminDep
) -> ClinicOut:
    return ClinicOut.model_validate(await service.update_clinic(db, clinic_id, body))


@router.patch("/{clinic_id}/status", response_model=ClinicOut)
async def update_status(
    clinic_id: int, body: ClinicStatusUpdate, db: DbSession, _: AdminDep
) -> ClinicOut:
    return ClinicOut.model_validate(await service.set_status(db, clinic_id, body.status))


@router.delete("/{clinic_id}", status_code=204)
async def delete_clinic(clinic_id: int, db: DbSession, _: AdminDep) -> None:
    await service.delete_clinic(db, clinic_id)


@router.get("/{clinic_id}/insurance-companies", response_model=list[int])
async def get_clinic_insurers(clinic_id: int, db: DbSession, _: AdminDep) -> list[int]:
    return await service.get_insurance_company_ids(db, clinic_id)


@router.put("/{clinic_id}/insurance-companies", response_model=list[int])
async def set_clinic_insurers(
    clinic_id: int, body: ClinicInsuranceUpdate, db: DbSession, _: AdminDep
) -> list[int]:
    return await service.set_insurance_companies(db, clinic_id, body.company_ids)


# ---------- 诊所-保司-模板 配置 ----------
@router.get("/{clinic_id}/config-overview", response_model=ClinicConfigOverview)
async def get_config_overview(
    clinic_id: int, db: DbSession, _: AdminDep
) -> ClinicConfigOverview:
    return await service.get_config_overview(db, clinic_id)


@router.patch(
    "/{clinic_id}/insurance-companies/{company_id}",
    response_model=CompanyEnableResult,
)
async def toggle_company(
    clinic_id: int,
    company_id: int,
    body: CompanyEnableUpdate,
    db: DbSession,
    _: AdminDep,
) -> CompanyEnableResult:
    await service.set_company_enabled(db, clinic_id, company_id, body.enabled)
    return CompanyEnableResult(company_id=company_id, enabled=body.enabled)


@router.patch("/{clinic_id}/templates/{template_id}", response_model=TemplateEnableResult)
async def toggle_template(
    clinic_id: int,
    template_id: int,
    body: TemplateEnableUpdate,
    db: DbSession,
    _: AdminDep,
) -> TemplateEnableResult:
    await service.set_template_enabled(db, clinic_id, template_id, body.enabled)
    return TemplateEnableResult(template_id=template_id, enabled=body.enabled)


@router.put(
    "/{clinic_id}/insurance-companies/{company_id}/templates",
    response_model=ClinicTemplatesSetResult,
)
async def set_company_templates(
    clinic_id: int,
    company_id: int,
    body: ClinicTemplatesSet,
    db: DbSession,
    _: AdminDep,
) -> ClinicTemplatesSetResult:
    enabled = await service.set_company_templates(
        db, clinic_id, company_id, body.template_ids
    )
    return ClinicTemplatesSetResult(enabled_template_ids=enabled)


# Compatibility alias for clients built before the canonical
# `insurance-companies` segment was introduced.  It is intentionally omitted
# from OpenAPI so the canonical route remains the single published contract.
@router.put(
    "/{clinic_id}/companies/{company_id}/templates",
    response_model=ClinicTemplatesSetResult,
    include_in_schema=False,
)
async def set_company_templates_legacy(
    clinic_id: int,
    company_id: int,
    body: ClinicTemplatesSet,
    db: DbSession,
    _: AdminDep,
) -> ClinicTemplatesSetResult:
    enabled = await service.set_company_templates(
        db, clinic_id, company_id, body.template_ids
    )
    return ClinicTemplatesSetResult(enabled_template_ids=enabled)
