"""诊所 / 医生 / 保险公司及关联关系模型。"""
from datetime import datetime
from typing import TYPE_CHECKING

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

if TYPE_CHECKING:
    from src.db.models.districts import District
    from src.db.models.mfa import DoctorMfaBackupCode
    from src.db.models.subscriptions import ClinicSubscription


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
    # 数据存放地区：香港 / 新加坡 / 美国
    data_region: Mapped[str] = mapped_column(String(20), default="香港")
    # 1 = 需要關注（运营手动标记）
    is_flagged: Mapped[int] = mapped_column(SmallInteger, default=0, index=True)
    # provisioning → onboarding → active（开通 / 导入 / 已启用）
    lifecycle_status: Mapped[str] = mapped_column(
        String(20), default="provisioning", server_default="provisioning"
    )
    district_id: Mapped[int | None] = mapped_column(
        ForeignKey("districts.id"), nullable=True, index=True
    )

    district: Mapped["District | None"] = relationship(back_populates="clinics")
    subscription: Mapped["ClinicSubscription | None"] = relationship(
        back_populates="clinic", uselist=False
    )
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
    # 预设界面语言（与前端 next-intl：zh-Hant-HK / en-HK）
    language: Mapped[str] = mapped_column(String(20), default="zh-Hant-HK")
    specialty_tag_id: Mapped[int] = mapped_column(
        ForeignKey("form_tag.id"), index=True
    )
    account_notes_format: Mapped[str] = mapped_column(String(20), default="markdown")
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    mfa_secret: Mapped[str | None] = mapped_column(Text, nullable=True)
    mfa_enrolled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    failed_mfa_attempts: Mapped[int] = mapped_column(SmallInteger, default=0)
    account_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    # registered = 已完成首次激活；unregistered = 待首次登入/改密
    registration_status: Mapped[str] = mapped_column(String(20), default="registered")

    clinic: Mapped["Clinic | None"] = relationship(back_populates="doctors")
    clinic_links: Mapped[list["DoctorClinicLink"]] = relationship(
        back_populates="doctor", cascade="all, delete-orphan"
    )
    mfa_backup_codes: Mapped[list["DoctorMfaBackupCode"]] = relationship(
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
