from fastapi import APIRouter

from src.deps import DbSession, DoctorDep
from src.modules.impersonation.route import ImpersonationAuditRoute
from src.modules.ai_extraction import service
from src.modules.ai_extraction.schemas import ExtractRequest, ExtractResponse

router = APIRouter(
    prefix="/api/doctor/ai",
    tags=["doctor:ai"],
    route_class=ImpersonationAuditRoute,
)

@router.post("/extract", response_model=ExtractResponse)
async def extract(
    body: ExtractRequest, db: DbSession, doctor: DoctorDep
) -> ExtractResponse:
    return await service.extract(
        db,
        text=body.medical_record_text,
        template_id=body.template_id,
        clinic_id=doctor.clinic_id,
        doctor_id=doctor.id,
    )
