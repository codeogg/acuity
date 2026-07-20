"""pytest 公共 fixtures。"""
import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.models import Clinic, Doctor
from src.db.session import async_session_factory, engine


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.rollback()
            await session.close()
    await engine.dispose()


@pytest_asyncio.fixture
async def demo_clinic_doctor(db_session: AsyncSession):
    clinic = (
        await db_session.execute(
            select(Clinic).where(Clinic.clinic_code == "DEMO_CLINIC")
        )
    ).scalar_one()
    doctor = (
        await db_session.execute(
            select(Doctor).where(Doctor.login_account == "doctor")
        )
    ).scalar_one()
    return clinic, doctor
