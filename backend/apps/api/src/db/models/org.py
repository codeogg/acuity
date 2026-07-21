"""诊所 / 医生 / 保险公司及关联关系模型。"""
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    SmallInteger,
    String,
    Text,
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
    idle_lock_minutes: Mapped[int] = mapped_column(SmallInteger, default=10)

    doctors: Mapped[list["Doctor"]] = relationship(back_populates="clinic")
    doctor_links: Mapped[list["DoctorClinicLink"]] = relationship(
        back_populates="clinic"
    )


class Doctor(Base, TimestampMixin):
    __tablename__ = "doctor"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # 主诊所镜像：与 doctor_clinic_link.is_primary 保持同步；无关联时为 NULL
    clinic_id: Mapped[int | None] = mapped_column(
        ForeignKey("clinic.id"), index=True, nullable=True
    )
    doctor_name: Mapped[str] = mapped_column(String(100))
    doctor_name_en: Mapped[str | None] = mapped_column(String(100))
    reg_no: Mapped[str | None] = mapped_column(String(50))
    email: Mapped[str | None] = mapped_column(String(255))
    signature_url: Mapped[str | None] = mapped_column(String(255))
    login_account: Mapped[str] = mapped_column(String(100), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    status: Mapped[int] = mapped_column(SmallInteger, default=1)
    workspace_mode: Mapped[str] = mapped_column(String(20), default="separated")
    account_notes: Mapped[str | None] = mapped_column(Text)
    # 个人覆盖；NULL 时继承主诊所 clinic.idle_lock_minutes
    idle_lock_minutes: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)

    clinic: Mapped["Clinic | None"] = relationship(back_populates="doctors")
    clinic_links: Mapped[list["DoctorClinicLink"]] = relationship(
        back_populates="doctor", cascade="all, delete-orphan"
    )


class DoctorClinicLink(Base):
    """医生与诊所的多对多关联；同一医生至多一个 is_primary（应用层保证）。"""

    __tablename__ = "doctor_clinic_link"
    __table_args__ = (
        UniqueConstraint("doctor_id", "clinic_id", name="uq_doctor_clinic_link"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    doctor_id: Mapped[int] = mapped_column(ForeignKey("doctor.id"), index=True)
    clinic_id: Mapped[int] = mapped_column(ForeignKey("clinic.id"), index=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False)
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    doctor: Mapped["Doctor"] = relationship(back_populates="clinic_links")
    clinic: Mapped["Clinic"] = relationship(back_populates="doctor_links")


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
