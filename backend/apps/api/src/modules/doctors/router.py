from fastapi import APIRouter, Query

from src.deps import AdminDep, DbSession
from src.modules.common import Page
from src.modules.doctors import service
from src.modules.doctors.schemas import (
    DoctorCreate,
    DoctorOut,
    DoctorStatusUpdate,
    DoctorUpdate,
    ResetPasswordResponse,
)

router = APIRouter(prefix="/api/admin/doctors", tags=["admin:doctors"])


@router.post("", response_model=DoctorOut)
async def create_doctor(body: DoctorCreate, db: DbSession, _: AdminDep) -> DoctorOut:
    return DoctorOut.model_validate(await service.create_doctor(db, body))


@router.get("", response_model=Page[DoctorOut])
async def list_doctors(
    db: DbSession,
    _: AdminDep,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    clinic_id: int | None = None,
    keyword: str | None = None,
) -> Page[DoctorOut]:
    items, total = await service.list_doctors(
        db, page=page, page_size=page_size, clinic_id=clinic_id, keyword=keyword
    )
    return Page(
        items=[DoctorOut.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{doctor_id}", response_model=DoctorOut)
async def get_doctor(doctor_id: int, db: DbSession, _: AdminDep) -> DoctorOut:
    return DoctorOut.model_validate(await service.get_doctor(db, doctor_id))


@router.put("/{doctor_id}", response_model=DoctorOut)
async def update_doctor(
    doctor_id: int, body: DoctorUpdate, db: DbSession, _: AdminDep
) -> DoctorOut:
    return DoctorOut.model_validate(await service.update_doctor(db, doctor_id, body))


@router.patch("/{doctor_id}/status", response_model=DoctorOut)
async def update_status(
    doctor_id: int, body: DoctorStatusUpdate, db: DbSession, _: AdminDep
) -> DoctorOut:
    return DoctorOut.model_validate(await service.set_status(db, doctor_id, body.status))


@router.delete("/{doctor_id}", status_code=204)
async def delete_doctor(doctor_id: int, db: DbSession, _: AdminDep) -> None:
    await service.delete_doctor(db, doctor_id)


@router.post("/{doctor_id}/reset-password", response_model=ResetPasswordResponse)
async def reset_password(
    doctor_id: int, db: DbSession, _: AdminDep
) -> ResetPasswordResponse:
    temp = await service.reset_password(db, doctor_id)
    return ResetPasswordResponse(temp_password=temp)
