from fastapi import APIRouter, File, Form, Query, UploadFile

from src.deps import AdminDep, DbSession
from src.modules.pdf_generation import service as pdf_service
from src.modules.templates import service
from src.modules.templates.schemas import (
    FieldIgnoreSave,
    FieldMappingSave,
    FieldMappingSaveResult,
    FieldRestoreSave,
    ParseProgressOut,
    PreviewFillRequest,
    PreviewFillResponse,
    PublishPreviewOut,
    ReparseResponse,
    TemplateFieldCreate,
    TemplateFieldOut,
    TemplateFieldUpdate,
    TemplateFileReplaceResponse,
    TemplateOut,
    TemplateUpdate,
    TemplateUploadResponse,
)
from src.tasks.queue import enqueue_parse_template
from src.utils import storage

router = APIRouter(prefix="/api/admin/templates", tags=["admin:templates"])


@router.post("", response_model=TemplateUploadResponse)
async def upload_template(
    db: DbSession,
    admin: AdminDep,
    company_id: int = Form(...),
    template_name: str = Form(...),
    file: UploadFile = File(...),
) -> TemplateUploadResponse:
    content = await file.read()
    template = await service.create_template(
        db,
        company_id=company_id,
        template_name=template_name,
        filename=file.filename or "template.pdf",
        file_bytes=content,
        created_by=admin.id,
    )
    await db.flush()
    job_id = await enqueue_parse_template(template.id)
    if job_id:
        template.parse_job_id = job_id
    return TemplateUploadResponse(id=template.id, parse_status=template.parse_status)


@router.get("", response_model=list[TemplateOut])
async def list_templates(
    db: DbSession, _: AdminDep, company_id: int | None = Query(None)
) -> list[TemplateOut]:
    items = await service.list_templates(db, company_id=company_id)
    return [TemplateOut.model_validate(t) for t in items]


@router.get("/{template_id}", response_model=TemplateOut)
async def get_template(template_id: int, db: DbSession, _: AdminDep) -> TemplateOut:
    return TemplateOut.model_validate(await service.get_template(db, template_id))


@router.put("/{template_id}", response_model=TemplateOut)
async def update_template(
    template_id: int, body: TemplateUpdate, db: DbSession, _: AdminDep
) -> TemplateOut:
    template = await service.update_template(
        db,
        template_id,
        template_name=body.template_name,
        company_id=body.company_id,
    )
    return TemplateOut.model_validate(template)


@router.put("/{template_id}/file", response_model=TemplateFileReplaceResponse)
async def replace_template_file(
    template_id: int,
    db: DbSession,
    _: AdminDep,
    file: UploadFile = File(...),
) -> TemplateFileReplaceResponse:
    content = await file.read()
    template = await service.replace_template_file(
        db,
        template_id,
        filename=file.filename or "template.pdf",
        file_bytes=content,
    )
    job_id = await enqueue_parse_template(template.id)
    if job_id:
        template.parse_job_id = job_id
    return TemplateFileReplaceResponse(id=template.id, parse_status=template.parse_status)


@router.get("/{template_id}/parse-progress", response_model=ParseProgressOut)
async def get_parse_progress(
    template_id: int, db: DbSession, _: AdminDep
) -> ParseProgressOut:
    return await service.get_parse_progress(db, template_id)


@router.post("/{template_id}/reparse", response_model=ReparseResponse)
async def reparse_template(
    template_id: int, db: DbSession, _: AdminDep
) -> ReparseResponse:
    template = await service.prepare_reparse(db, template_id)
    job_id = await enqueue_parse_template(template.id)
    if job_id:
        template.parse_job_id = job_id
    return ReparseResponse(
        id=template.id,
        parse_status=template.parse_status,
        parse_job_id=job_id,
    )


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: int, db: DbSession, _: AdminDep) -> None:
    await service.delete_template(db, template_id)


@router.get("/{template_id}/fields", response_model=list[TemplateFieldOut])
async def list_fields(
    template_id: int, db: DbSession, _: AdminDep
) -> list[TemplateFieldOut]:
    fields = await service.list_fields(db, template_id)
    return [TemplateFieldOut.model_validate(f) for f in fields]


@router.post("/{template_id}/fields", response_model=TemplateFieldOut)
async def create_field(
    template_id: int, body: TemplateFieldCreate, db: DbSession, _: AdminDep
) -> TemplateFieldOut:
    field = await service.create_field(db, template_id, body)
    return TemplateFieldOut.model_validate(field)


@router.put("/{template_id}/fields/{field_id}", response_model=TemplateFieldOut)
async def update_field(
    template_id: int,
    field_id: int,
    body: TemplateFieldUpdate,
    db: DbSession,
    _: AdminDep,
) -> TemplateFieldOut:
    field = await service.update_field(db, field_id, body)
    return TemplateFieldOut.model_validate(field)


@router.delete("/{template_id}/fields/{field_id}", status_code=204)
async def delete_field(template_id: int, field_id: int, db: DbSession, _: AdminDep) -> None:
    await service.delete_field(db, field_id)


@router.post(
    "/{template_id}/fields/{field_id}/mapping",
    response_model=FieldMappingSaveResult,
)
async def save_mapping(
    template_id: int,
    field_id: int,
    body: FieldMappingSave,
    db: DbSession,
    admin: AdminDep,
) -> FieldMappingSaveResult:
    mapping = await service.save_mapping(db, field_id, body, admin.id)
    return FieldMappingSaveResult(id=mapping.id)


@router.patch("/{template_id}/fields/{field_id}/ignore", response_model=TemplateFieldOut)
async def ignore_field(
    template_id: int,
    field_id: int,
    body: FieldIgnoreSave,
    db: DbSession,
    _: AdminDep,
) -> TemplateFieldOut:
    field = await service.ignore_field(db, field_id, body)
    return TemplateFieldOut.model_validate(field)


@router.patch("/{template_id}/fields/{field_id}/restore", response_model=TemplateFieldOut)
async def restore_field(
    template_id: int,
    field_id: int,
    body: FieldRestoreSave,
    db: DbSession,
    _: AdminDep,
) -> TemplateFieldOut:
    field = await service.restore_field(db, field_id, body)
    return TemplateFieldOut.model_validate(field)


@router.get("/{template_id}/publish-preview", response_model=PublishPreviewOut)
async def publish_preview(
    template_id: int, db: DbSession, _: AdminDep
) -> PublishPreviewOut:
    return await service.get_publish_preview(db, template_id)


@router.post("/{template_id}/preview-fill", response_model=PreviewFillResponse)
async def preview_fill(
    template_id: int,
    body: PreviewFillRequest,
    db: DbSession,
    _: AdminDep,
) -> PreviewFillResponse:
    template = await service.get_template(db, template_id)
    original = storage.download_bytes(template.original_pdf_url)
    pdf_bytes = await pdf_service.render_preview(
        db, template_id, original, body.sample_values
    )
    key = f"previews/{template.template_code}/preview.pdf"
    url = storage.upload_bytes(pdf_bytes, key, content_type="application/pdf")
    return PreviewFillResponse(preview_pdf_url=url)


@router.post("/{template_id}/publish", response_model=TemplateOut)
async def publish_template(template_id: int, db: DbSession, _: AdminDep) -> TemplateOut:
    return TemplateOut.model_validate(await service.publish_template(db, template_id))
