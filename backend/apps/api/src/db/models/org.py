"""诊所 / 医生 / 保险公司及关联关系模型。"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.db.base import Base, TimestampMixin


class Clinic(Base, TimestampMixin):
    __tablename__ = "clinic"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    clinic_code: Mapped[str] = mapped_column(String(50), unique=True)
    clinic_name: Mapped[str] = mapped_column(String(200))
    clinic_name_en: Mapped[str | None] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(50))
    chop_image_url: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[int] = mapped_column(SmallInteger, default=1)  # 0停用 1启用

    doctors: Mapped[list["Doctor"]] = relationship(back_populates="clinic")


class Doctor(Base, TimestampMixin):
    __tablename__ = "doctor"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinic.id"), index=True)
    doctor_name: Mapped[str] = mapped_column(String(100))
    doctor_name_en: Mapped[str | None] = mapped_column(String(100))
    reg_no: Mapped[str | None] = mapped_column(String(50))
    signature_url: Mapped[str | None] = mapped_column(String(255))
    login_account: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[int] = mapped_column(SmallInteger, default=1)

    clinic: Mapped["Clinic"] = relationship(back_populates="doctors")


class InsuranceCompany(Base, TimestampMixin):
    __tablename__ = "insurance_company"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_code: Mapped[str] = mapped_column(String(50), unique=True)
    company_name: Mapped[str] = mapped_column(String(200))
    company_name_en: Mapped[str | None] = mapped_column(String(200))
    logo_url: Mapped[str | None] = mapped_column(String(255))
    contact_info: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[int] = mapped_column(SmallInteger, default=1)


class ClinicInsuranceCompany(Base):
    __tablename__ = "clinic_insurance_company"
    __table_args__ = (UniqueConstraint("clinic_id", "company_id"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinic.id"))
    company_id: Mapped[int] = mapped_column(ForeignKey("insurance_company.id"))
    status: Mapped[int] = mapped_column(SmallInteger, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
