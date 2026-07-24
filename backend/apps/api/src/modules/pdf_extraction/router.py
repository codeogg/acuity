"""医生端 PDF 提取测试 API。"""
from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response

from src.deps import DbSession, DoctorDep
from src.modules.impersonation.route import ImpersonationAuditRoute
from src.modules.impersonation.access import ImpersonationAccess, ImpersonationAccessLevel
from src.modules.pdf_extraction import service
from src.modules.pdf_extraction.schemas import (
    DocumentClassificationOut,
    DocumentPageOut,
    ExtractionTaskOut,
    OcrResultOut,
    Step1UploadOutput,
    Step2PreprocessOutput,
    Step3OcrOutput,
    Step4ClassifyOutput,
    Step5DetectVisitsOutput,
    Step5SelectVisitInput,
    Step5SelectVisitOutput,
    Step6BuildPromptOutput,
    Step7ExtractFieldsOutput,
    Step8ValidateOutput,
    Step9DetectMissingOutput,
    Step10MapInput,
    Step10MapOutput,
    FinalizeExtractionInput,
    FinalizeExtractionOutput,
    Step11ConfirmReviewOutput,
    Step11PrepareReviewOutput,
    Step11SaveReviewInput,
    Step11SaveReviewOutput,
    ExtractionMappedResultOut,
    ExtractionPromptOut,
    ExtractionResultOut,
    ExtractionReviewOutputOut,
    VisitCandidateOut,
)

router = APIRouter(
    prefix="/api/doctor/extraction-tasks",
    tags=["doctor:pdf-extraction"],
    route_class=ImpersonationAuditRoute,
)

@router.post("", response_model=Step1UploadOutput)
async def upload_pdf(
    db: DbSession,
    doctor: DoctorDep,
    file: UploadFile = File(...),
    patient_name: str | None = Form(default=None),
) -> Step1UploadOutput:
    """Step1：上传病历 PDF，创建提取任务（status=WAITING）。"""
    raw = await file.read()
    filename = file.filename or "upload.pdf"
    return await service.create_upload_task(
        db,
        clinic_id=doctor.clinic_id,
        doctor_id=doctor.id,
        filename=filename,
        file_bytes=raw,
        patient_name=patient_name or None,
    )


@router.get("/{task_id}", response_model=ExtractionTaskOut)
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def get_task(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> ExtractionTaskOut:
    task = await service.get_task(db, task_no=task_id, clinic_id=doctor.clinic_id)
    return ExtractionTaskOut.model_validate(task)


@router.get("/{task_id}/pdf")
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def get_task_pdf(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> Response:
    """流式返回任务原件 PDF（鉴权代理，避免 MinIO 私有桶 iframe 403）。"""
    pdf_bytes, filename = await service.get_task_pdf_bytes(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )
    safe_name = filename.replace('"', "")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{safe_name}"'},
    )


@router.post("/{task_id}/preprocess", response_model=Step2PreprocessOutput)
async def preprocess_pdf(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> Step2PreprocessOutput:
    """Step2：PDF 预处理（文本层判别 + 扫描页转 PNG）。"""
    return await service.run_preprocess(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.get("/{task_id}/pages", response_model=list[DocumentPageOut])
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def list_pages(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> list[DocumentPageOut]:
    """查询 Step2 产出的 document_page 记录。"""
    return await service.list_document_pages(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.post("/{task_id}/ocr", response_model=Step3OcrOutput)
async def run_ocr(task_id: str, db: DbSession, doctor: DoctorDep) -> Step3OcrOutput:
    """Step3：文档解析（MinerU→Markdown 或 PaddleOCR 逐页识别）。"""
    return await service.run_ocr(db, task_no=task_id, clinic_id=doctor.clinic_id)


@router.get("/{task_id}/ocr-results", response_model=list[OcrResultOut])
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def list_ocr_results(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> list[OcrResultOut]:
    """查询 Step3 产出的 ocr_result 记录。"""
    return await service.list_ocr_results(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.post("/{task_id}/classify", response_model=Step4ClassifyOutput)
async def classify_document(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> Step4ClassifyOutput:
    """Step4：文档分类（Gemini 2.5 Flash）。"""
    return await service.run_classify(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.get("/{task_id}/classification", response_model=DocumentClassificationOut)
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def get_classification(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> DocumentClassificationOut:
    """查询 Step4 产出的 document_classification 记录。"""
    return await service.get_classification(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.post("/{task_id}/detect-visits", response_model=Step5DetectVisitsOutput)
async def detect_visits(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> Step5DetectVisitsOutput:
    """Step5：多就诊检测（Gemini 2.5 Flash）。"""
    return await service.run_detect_visits(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.get("/{task_id}/visits", response_model=list[VisitCandidateOut])
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def list_visits(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> list[VisitCandidateOut]:
    """查询 Step5 产出的候选就诊记录。"""
    return await service.list_visits(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.post("/{task_id}/visits/select", response_model=Step5SelectVisitOutput)
async def select_visit(
    task_id: str,
    body: Step5SelectVisitInput,
    db: DbSession,
    doctor: DoctorDep,
) -> Step5SelectVisitOutput:
    """Step5：用户选择目标就诊，进入字段提取阶段。"""
    return await service.select_visit(
        db, task_no=task_id, clinic_id=doctor.clinic_id, data=body
    )


@router.post("/{task_id}/build-prompt", response_model=Step6BuildPromptOutput)
async def build_prompt(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> Step6BuildPromptOutput:
    """Step6：Prompt Builder（本地拼装）。"""
    return await service.run_build_prompt(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.get("/{task_id}/prompt", response_model=ExtractionPromptOut)
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def get_prompt(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> ExtractionPromptOut:
    """查询 Step6 产出的 extraction_prompt。"""
    return await service.get_prompt(db, task_no=task_id, clinic_id=doctor.clinic_id)


@router.post("/{task_id}/extract-fields", response_model=Step7ExtractFieldsOutput)
async def extract_fields(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> Step7ExtractFieldsOutput:
    """Step7：字段提取（Gemini Pro）。"""
    return await service.run_extract_fields(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.get("/{task_id}/extraction-result", response_model=ExtractionResultOut)
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def get_extraction_result(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> ExtractionResultOut:
    """查询 Step7 产出的 extraction_result（raw）。"""
    return await service.get_extraction_result(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.post("/{task_id}/validate", response_model=Step8ValidateOutput)
async def validate_fields(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> Step8ValidateOutput:
    """Step8：Validation Engine（本地规则校验）。"""
    return await service.run_validate(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.post("/{task_id}/detect-missing", response_model=Step9DetectMissingOutput)
async def detect_missing(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> Step9DetectMissingOutput:
    """Step9：Missing Detector（本地缺失检测）。"""
    return await service.run_detect_missing(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.post("/{task_id}/finalize-extraction", response_model=FinalizeExtractionOutput)
async def finalize_extraction(
    task_id: str,
    db: DbSession,
    doctor: DoctorDep,
    body: FinalizeExtractionInput = FinalizeExtractionInput(),
) -> FinalizeExtractionOutput:
    """Step8–10 合并：校验 + 缺失检测 + 保险映射（推荐前端在 Step7 后调用）。"""
    return await service.run_finalize_extraction(
        db,
        task_no=task_id,
        clinic_id=doctor.clinic_id,
        data=body,
    )


@router.post("/{task_id}/map-to-insurance", response_model=Step10MapOutput)
async def map_to_insurance(
    task_id: str,
    db: DbSession,
    doctor: DoctorDep,
    body: Step10MapInput = Step10MapInput(),
) -> Step10MapOutput:
    """Step10：Insurance Mapper（本地字段名映射）。"""
    return await service.run_map_to_insurance(
        db,
        task_no=task_id,
        clinic_id=doctor.clinic_id,
        data=body,
    )


@router.get("/{task_id}/mapped-result", response_model=ExtractionMappedResultOut)
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def get_mapped_result(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> ExtractionMappedResultOut:
    """查询 Step10 产出的 extraction_mapped_result。"""
    return await service.get_mapped_result(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.post("/{task_id}/prepare-review", response_model=Step11PrepareReviewOutput)
async def prepare_review(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> Step11PrepareReviewOutput:
    """Step11：生成标准 JSON（含 OCR 溯源），进入人工审核。"""
    return await service.run_prepare_review(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.get("/{task_id}/review-output", response_model=ExtractionReviewOutputOut)
@ImpersonationAccess(ImpersonationAccessLevel.READ_ONLY)
async def get_review_output(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> ExtractionReviewOutputOut:
    """查询 Step11 标准审核 JSON。"""
    return await service.get_review_output(
        db, task_no=task_id, clinic_id=doctor.clinic_id
    )


@router.put("/{task_id}/review-output", response_model=Step11SaveReviewOutput)
async def save_review_output(
    task_id: str,
    body: Step11SaveReviewInput,
    db: DbSession,
    doctor: DoctorDep,
) -> Step11SaveReviewOutput:
    """Step11：保存医生编辑后的字段值。"""
    return await service.save_review_output(
        db,
        task_no=task_id,
        clinic_id=doctor.clinic_id,
        doctor_id=doctor.id,
        data=body,
    )


@router.post("/{task_id}/confirm-review", response_model=Step11ConfirmReviewOutput)
async def confirm_review(
    task_id: str, db: DbSession, doctor: DoctorDep
) -> Step11ConfirmReviewOutput:
    """Step11：确认审核完成，任务状态 → COMPLETED。"""
    return await service.confirm_review(
        db,
        task_no=task_id,
        clinic_id=doctor.clinic_id,
        doctor_id=doctor.id,
    )
