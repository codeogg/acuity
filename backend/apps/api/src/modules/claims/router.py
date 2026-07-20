from datetime import datetime

from fastapi import APIRouter, File, Form, Query, UploadFile, status
from fastapi.responses import Response

from src.core.exceptions import NotFoundException, ValidationException
from src.deps import DbSession, DoctorDep
from src.modules.claims import service
from src.modules.claims.schemas import (
    ClaimCreate,
    ClaimOut,
    ClaimMedicalPdfUploadOutput,
    DraftSave,
    DraftSaveResponse,
    ExtractEnqueueResponse,
    ExtractProgressOut,
    FieldsUpdate,
    GeneratePdfResponse,
    HomeOverview,
    MedicalRecordSubmit,
    ResumeExtractionInput,
    ReuseRequest,
    ReuseResponse,
    TemplateBrief,
    TemplateSpecificAiFieldOut,
    CompanyBrief,
    ClaimListItem,
)
from src.modules.common import Page
from src.modules.pdf_generation import service as pdf_service

router = APIRouter(prefix="/api/doctor", tags=["doctor:claims"])


@router.get("/home/overview", response_model=HomeOverview)
async def home_overview(db: DbSession, doctor: DoctorDep) -> HomeOverview:
    return await service.get_home_overview(
        db, doctor_id=doctor.id, clinic_id=doctor.clinic_id
    )


@router.get("/insurance-companies", response_model=list[CompanyBrief])
async def list_companies(db: DbSession, doctor: DoctorDep) -> list[CompanyBrief]:
    companies = await service.list_available_companies(db, doctor.clinic_id)
    return [CompanyBrief.model_validate(c) for c in companies]


@router.get(
    "/insurance-companies/{company_id}/templates",
    response_model=list[TemplateBrief],
)
async def list_templates(
    company_id: int, db: DbSession, doctor: DoctorDep
) -> list[TemplateBrief]:
    templates = await service.list_available_templates(
        db, doctor.clinic_id, company_id
    )
    return [TemplateBrief.model_validate(t) for t in templates]


@router.post("/claims", response_model=ClaimOut)
async def create_claim(
    body: ClaimCreate, db: DbSession, doctor: DoctorDep
) -> ClaimOut:
    claim = await service.create_claim(
        db, doctor_id=doctor.id, clinic_id=doctor.clinic_id, data=body
    )
    return await service.claim_to_out(db, claim)


@router.post("/claims/{claim_id}/medical-pdf", response_model=ClaimMedicalPdfUploadOutput)
async def upload_claim_medical_pdf(
    claim_id: int,
    db: DbSession,
    doctor: DoctorDep,
    file: UploadFile = File(...),
    patient_name: str | None = Form(default=None),
) -> ClaimMedicalPdfUploadOutput:
    """上传病历 PDF 并创建关联的提取任务。"""
    raw = await file.read()
    claim, task = await service.upload_medical_pdf(
        db,
        claim_id=claim_id,
        clinic_id=doctor.clinic_id,
        doctor_id=doctor.id,
        filename=file.filename or "upload.pdf",
        file_bytes=raw,
        patient_name=patient_name or None,
    )
    return ClaimMedicalPdfUploadOutput(
        extraction_task_id=task.id,
        extraction_task_no=task.task_no,
        original_filename=task.original_filename,
        patient_name=claim.patient_name,
    )


@router.post(
    "/claims/{claim_id}/extract-from-pdf",
    response_model=ExtractEnqueueResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def extract_from_pdf(
    claim_id: int, db: DbSession, doctor: DoctorDep
) -> ExtractEnqueueResponse:
    job_id, extract_status = await service.start_extract_from_pdf(
        db, claim_id=claim_id, clinic_id=doctor.clinic_id
    )
    return ExtractEnqueueResponse(job_id=job_id, status=extract_status)


@router.post("/claims/{claim_id}/cancel-extraction", response_model=ClaimOut)
async def cancel_extraction(
    claim_id: int, db: DbSession, doctor: DoctorDep
) -> ClaimOut:
    """取消进行中的 AI 识别，保留已上传病历 PDF，可重新点击「AI 识别」。"""
    claim = await service.cancel_extract_from_pdf(
        db, claim_id=claim_id, clinic_id=doctor.clinic_id
    )
    return await service.claim_to_out(db, claim)


@router.post(
    "/claims/{claim_id}/resume-extraction",
    response_model=ExtractEnqueueResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def resume_extraction(
    claim_id: int,
    body: ResumeExtractionInput,
    db: DbSession,
    doctor: DoctorDep,
) -> ExtractEnqueueResponse:
    job_id, extract_status = await service.resume_extraction(
        db,
        claim_id=claim_id,
        clinic_id=doctor.clinic_id,
        visit_index=body.visit_index,
    )
    return ExtractEnqueueResponse(job_id=job_id, status=extract_status)


@router.get("/claims/{claim_id}/extract-progress", response_model=ExtractProgressOut)
async def get_extract_progress(
    claim_id: int, db: DbSession, doctor: DoctorDep
) -> ExtractProgressOut:
    return await service.get_extract_progress(
        db, claim_id=claim_id, clinic_id=doctor.clinic_id
    )


@router.get(
    "/claims/{claim_id}/template-specific-ai-fields",
    response_model=list[TemplateSpecificAiFieldOut],
)
async def list_template_specific_ai_fields(
    claim_id: int, db: DbSession, doctor: DoctorDep
) -> list[TemplateSpecificAiFieldOut]:
    """当前填报模板的「模板专属 AI 提取」字段，供标准字段核对占位展示。"""
    rows = await service.list_template_specific_ai_fields(
        db, claim_id=claim_id, clinic_id=doctor.clinic_id
    )
    return [TemplateSpecificAiFieldOut.model_validate(row) for row in rows]


@router.post("/claims/{claim_id}/apply-extraction", response_model=ClaimOut)
async def apply_claim_extraction(
    claim_id: int, db: DbSession, doctor: DoctorDep
) -> ClaimOut:
    """将 PDF 提取结果写入填报字段，进入待核对状态。"""
    claim = await service.apply_extraction(
        db, claim_id=claim_id, clinic_id=doctor.clinic_id
    )
    return await service.claim_to_out(db, claim)


@router.post("/claims/{claim_id}/reset-medical-upload", response_model=ClaimOut)
async def reset_medical_upload(
    claim_id: int, db: DbSession, doctor: DoctorDep
) -> ClaimOut:
    """退回上传病历步骤，清空关联提取任务与已填字段。"""
    claim = await service.reset_medical_upload(
        db, claim_id=claim_id, clinic_id=doctor.clinic_id
    )
    return await service.claim_to_out(db, claim)


@router.put("/claims/{claim_id}/draft", response_model=DraftSaveResponse)
async def save_draft(
    claim_id: int, body: DraftSave, db: DbSession, doctor: DoctorDep
) -> DraftSaveResponse:
    claim = await service.save_draft(
        db,
        claim_id=claim_id,
        clinic_id=doctor.clinic_id,
        patient_name=body.patient_name,
        medical_record_text=body.medical_record_text,
    )
    return DraftSaveResponse(saved_at=claim.updated_at)


@router.post("/claims/{claim_id}/extract", response_model=ClaimOut)
async def extract_claim(
    claim_id: int, db: DbSession, doctor: DoctorDep
) -> ClaimOut:
    claim = await service.extract_from_record(
        db, claim_id=claim_id, clinic_id=doctor.clinic_id
    )
    return await service.claim_to_out(db, claim)


@router.put("/claims/{claim_id}/medical-record", response_model=ClaimOut)
async def submit_medical_record(
    claim_id: int, body: MedicalRecordSubmit, db: DbSession, doctor: DoctorDep
) -> ClaimOut:
    claim = await service.submit_medical_record(
        db,
        claim_id=claim_id,
        clinic_id=doctor.clinic_id,
        text=body.medical_record_text,
        patient_name=body.patient_name,
    )
    return await service.claim_to_out(db, claim)


@router.put("/claims/{claim_id}/fields", response_model=ClaimOut)
async def update_fields(
    claim_id: int, body: FieldsUpdate, db: DbSession, doctor: DoctorDep
) -> ClaimOut:
    claim = await service.update_fields(
        db,
        claim_id=claim_id,
        clinic_id=doctor.clinic_id,
        values=body.final_field_values,
        confirmed=body.confirmed,
        row_version=body.row_version,
    )
    return await service.claim_to_out(db, claim)


@router.post("/claims/{claim_id}/confirm", response_model=ClaimOut)
async def confirm(claim_id: int, db: DbSession, doctor: DoctorDep) -> ClaimOut:
    claim = await service.confirm(db, claim_id=claim_id, clinic_id=doctor.clinic_id)
    return await service.claim_to_out(db, claim)


@router.post("/claims/{claim_id}/generate-pdf", response_model=GeneratePdfResponse)
async def generate_pdf(
    claim_id: int, db: DbSession, doctor: DoctorDep
) -> GeneratePdfResponse:
    claim = await service.get_claim(db, claim_id, doctor.clinic_id)
    if claim.status not in ("CONFIRMED", "PRINTED"):
        raise ValidationException("仅已确认或已打印状态可生成保单 PDF")
    url = await pdf_service.generate_for_submission(db, claim_id, doctor.clinic_id)
    return GeneratePdfResponse(pdf_url=url, generated_at=pdf_service.build_generated_at())


@router.get("/claims/{claim_id}/pdf")
async def get_claim_pdf(claim_id: int, db: DbSession, doctor: DoctorDep) -> Response:
    """返回已生成的保单 PDF 文件流，供前端 iframe 预览。"""
    pdf_bytes, filename = await pdf_service.get_submission_pdf_bytes(
        db, claim_id, doctor.clinic_id
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
        },
    )


@router.post("/claims/{claim_id}/revert-to-review", response_model=ClaimOut)
async def revert_to_review(
    claim_id: int, db: DbSession, doctor: DoctorDep
) -> ClaimOut:
    claim = await service.revert_to_review(
        db, claim_id=claim_id, clinic_id=doctor.clinic_id
    )
    return await service.claim_to_out(db, claim)


@router.post("/claims/{claim_id}/mark-printed", response_model=ClaimOut)
async def mark_printed(claim_id: int, db: DbSession, doctor: DoctorDep) -> ClaimOut:
    claim = await service.mark_printed(db, claim_id=claim_id, clinic_id=doctor.clinic_id)
    return await service.claim_to_out(db, claim)


@router.post("/claims/{claim_id}/cancel", response_model=ClaimOut)
async def cancel(claim_id: int, db: DbSession, doctor: DoctorDep) -> ClaimOut:
    claim = await service.cancel(db, claim_id=claim_id, clinic_id=doctor.clinic_id)
    return await service.claim_to_out(db, claim)


@router.delete("/claims/{claim_id}", status_code=204)
async def delete_claim(claim_id: int, db: DbSession, doctor: DoctorDep) -> None:
    await service.delete_claim(db, claim_id=claim_id, clinic_id=doctor.clinic_id)


@router.post("/claims/{claim_id}/reuse-for-template", response_model=ReuseResponse)
async def reuse_for_template(
    claim_id: int, body: ReuseRequest, db: DbSession, doctor: DoctorDep
) -> ReuseResponse:
    claim, prefilled, missing = await service.reuse_for_template(
        db,
        claim_id=claim_id,
        clinic_id=doctor.clinic_id,
        new_template_id=body.new_template_id,
    )
    return ReuseResponse(
        submission_id=claim.id, prefilled_fields=prefilled, missing_fields=missing
    )


@router.get("/claims", response_model=Page[ClaimListItem])
async def list_claims(
    db: DbSession,
    doctor: DoctorDep,
    patient_name: str | None = None,
    status: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> Page[ClaimListItem]:
    items, total = await service.list_claims(
        db,
        clinic_id=doctor.clinic_id,
        doctor_id=doctor.id,
        patient_name=patient_name,
        status=status,
        date_from=date_from,
        date_to=date_to,
        page=page,
        page_size=page_size,
    )
    return Page(
        items=[ClaimListItem.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/claims/{claim_id}", response_model=ClaimOut)
async def get_claim(claim_id: int, db: DbSession, doctor: DoctorDep) -> ClaimOut:
    claim = await service.get_claim(db, claim_id, doctor.clinic_id)
    return await service.claim_to_out(db, claim)
