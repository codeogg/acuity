from fastapi import APIRouter, File, UploadFile

from src.deps import DbSession, DoctorDep
from src.modules.doctor_settings import service
from src.modules.doctor_settings.schemas import DoctorSettingsOut, DoctorSettingsUpdate

router = APIRouter(prefix="/api/doctor", tags=["doctor:settings"])


@router.get("/settings", response_model=DoctorSettingsOut)
async def get_settings(db: DbSession, current: DoctorDep) -> DoctorSettingsOut:
    doctor = await service.get_doctor(db, current.id)
    return await service.get_settings(db, doctor)


@router.put("/settings", response_model=DoctorSettingsOut)
async def update_settings(
    body: DoctorSettingsUpdate, db: DbSession, current: DoctorDep
) -> DoctorSettingsOut:
    doctor = await service.get_doctor(db, current.id)
    return await service.update_settings(db, doctor, body)


@router.post("/settings/signature", response_model=DoctorSettingsOut)
async def upload_signature(
    db: DbSession,
    current: DoctorDep,
    file: UploadFile = File(...),
) -> DoctorSettingsOut:
    doctor = await service.get_doctor(db, current.id)
    content = await file.read()
    return await service.upload_signature(
        db,
        doctor,
        filename=file.filename,
        content_type=file.content_type,
        content=content,
    )
