"""诊所导览步骤模板与每诊所进度。"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class OnboardingStepTemplate(Base):
    __tablename__ = "onboarding_step_template"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    step_code: Mapped[str] = mapped_column(String(50), unique=True)
    step_name: Mapped[str] = mapped_column(String(200))
    step_name_en: Mapped[str] = mapped_column(String(200))
    sort_order: Mapped[int] = mapped_column(SmallInteger, unique=True)


class ClinicOnboardingStep(Base):
    __tablename__ = "clinic_onboarding_step"
    __table_args__ = (
        UniqueConstraint("clinic_id", "step_code", name="uq_clinic_onboarding_step_clinic_code"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(
        ForeignKey("clinic.id", ondelete="CASCADE"), index=True
    )
    step_code: Mapped[str] = mapped_column(
        ForeignKey("onboarding_step_template.step_code"), index=True
    )
    # pending | completed
    status: Mapped[str] = mapped_column(String(20), default="pending")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_by: Mapped[int | None] = mapped_column(
        ForeignKey("admin_user.id"), nullable=True
    )
