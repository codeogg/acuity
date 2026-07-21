"""种子数据：创建默认管理员、示例诊所/医生/保险公司、标准字段库。

运行：python -m src.seed
标准字段与信息域以本文件为唯一来源，执行时会同步（删除不在列表中的字段）。
"""
import asyncio

from sqlalchemy import delete, select

from src.core.logging import configure_logging, get_logger
from src.core.security import hash_password, verify_password
from src.db.models import (
    AdminUser,
    ClaimFieldChangeLog,
    Clinic,
    ClinicInsuranceCompany,
    Doctor,
    DoctorClinicLink,
    FieldDomain,
    InsuranceCompany,
    StandardField,
    TemplateFieldMapping,
)
from src.db.session import async_session_factory
from src.modules.doctors.clinic_links import ensure_primary_clinic_link, link_clinic

logger = get_logger(__name__)


DOMAINS = [
    ("PATIENT", "患者信息", 1),
    ("INSURANCE", "保险信息", 2),
    ("CLINIC", "机构信息", 3),
    ("DOCTOR", "医生信息", 4),
    ("HOSPITALIZATION", "住院信息", 5),
    ("DIAGNOSIS", "诊断信息", 6),
    ("PROCEDURE", "手术/处置", 7),
    ("FEE", "费用信息", 8),
]

# 对齐 REQUIREMENTS.zh-CN.md；姓名保留中英拆分字段
STANDARD_FIELDS = [
    # (code, name, domain_code, data_type, required, source_type, hint)
    ("patient_name_cn", "患者姓名(中文)", "PATIENT", "text", True, "AI", "提取患者中文全名"),
    ("patient_name_en", "患者姓名(英文)", "PATIENT", "text", False, "AI", "提取患者英文姓名"),
    ("dob", "出生日期", "PATIENT", "date", False, "AI", "YYYY-MM-DD"),
    ("gender", "性别", "PATIENT", "enum", False, "AI", "对男/女映射为 Male/Female"),
    ("hkid", "香港身份证号码", "PATIENT", "text", False, "AI", "保留打码形式，不得猜测被遮蔽数字"),
    ("patient_phone", "患者电话", "PATIENT", "text", False, "AI", "香港8位电话号码"),
    ("insurer_name", "保险公司名称", "INSURANCE", "text", False, "AI", "保险公司名称"),
    ("policy_number", "保单号", "INSURANCE", "text", False, "AI", "不得与会员号/凭证号/网络代码混淆"),
    ("member_cert_no", "会员/凭证号", "INSURANCE", "text", False, "AI", "会员号或凭证号"),
    ("clinic_name", "医院/诊所名称", "CLINIC", "text", False, "AI", "医院或诊所，中文和/或英文"),
    ("doctor_name", "医生姓名", "DOCTOR", "text", False, "AI", "提取文档中本次就诊的主诊/签署医生姓名；不得使用登录医生；若与注册编号连排须拆分"),
    ("doctor_signature", "医生签名", "DOCTOR", "signature", False, "SYSTEM", "由系统带入"),
    ("visit_date", "就诊日期", "DIAGNOSIS", "date", False, "AI", "YYYY-MM-DD，本次就诊/看诊日期"),
    ("admission_date", "入院日期", "HOSPITALIZATION", "date", False, "AI", "YYYY-MM-DD"),
    ("discharge_date", "出院日期", "HOSPITALIZATION", "date", False, "AI", "YYYY-MM-DD"),
    ("ward_class", "病房等级", "HOSPITALIZATION", "enum", False, "AI", "对私家房/半私家房/標準房/深切治療病房/日間做映射"),
    ("operation_date", "手术日期", "HOSPITALIZATION", "date", False, "AI", "YYYY-MM-DD"),
    ("diagnosis_text", "诊断结果", "DIAGNOSIS", "text", True, "AI", "主要诊断，自由文本"),
    ("icd10", "ICD-10编码", "DIAGNOSIS", "text", False, "AI", "如 K35.80"),
    ("procedure_text", "手术/处置描述", "PROCEDURE", "text", False, "AI", "手术或处置自由文本"),
    ("cpt", "CPT编码", "PROCEDURE", "text", False, "AI", "如 44970"),
    ("amount_total", "总金额", "FEE", "number", False, "AI", "单据明确标注的总额/Total（HKD）；不得将 Consultation fee/诊金等单项收费当作总金额"),
    ("receipt_no", "收据号", "FEE", "text", False, "AI", "按原文提取，不得与预约编号混淆"),
]

ENUM_OPTIONS: dict[str, list[str]] = {
    "gender": ["Male", "Female"],
    "ward_class": ["Private", "Semi-private", "Standard", "ICU", "Day"],
}

CANONICAL_FIELD_CODES = frozenset(code for code, *_ in STANDARD_FIELDS)
CANONICAL_DOMAIN_CODES = frozenset(code for code, *_ in DOMAINS)


async def _sync_domains(db, *, remove_stale: bool = True) -> dict[str, FieldDomain]:
    domain_map: dict[str, FieldDomain] = {}
    for code, name, order in DOMAINS:
        domain = (
            await db.execute(select(FieldDomain).where(FieldDomain.domain_code == code))
        ).scalar_one_or_none()
        if not domain:
            domain = FieldDomain(domain_code=code, domain_name=name, sort_order=order)
            db.add(domain)
            await db.flush()
        else:
            domain.domain_name = name
            domain.sort_order = order
        domain_map[code] = domain

    if remove_stale:
        extra_domains = (
            await db.execute(
                select(FieldDomain).where(FieldDomain.domain_code.not_in(CANONICAL_DOMAIN_CODES))
            )
        ).scalars().all()
        for domain in extra_domains:
            await db.delete(domain)
            logger.info("seed_domain_removed", domain_code=domain.domain_code)

    return domain_map


async def _sync_standard_fields(
    db, domain_map: dict[str, FieldDomain], *, remove_stale: bool = True
) -> None:
    for code, name, dcode, dtype, req, src, hint in STANDARD_FIELDS:
        field = (
            await db.execute(select(StandardField).where(StandardField.field_code == code))
        ).scalar_one_or_none()
        if not field:
            db.add(
                StandardField(
                    field_code=code,
                    field_name=name,
                    domain_id=domain_map[dcode].id,
                    data_type=dtype,
                    is_required=req,
                    source_type=src,
                    ai_extraction_hint=hint,
                    enum_options=ENUM_OPTIONS.get(code),
                )
            )
            continue

        field.field_name = name
        field.domain_id = domain_map[dcode].id
        field.data_type = dtype
        field.is_required = req
        field.source_type = src
        field.ai_extraction_hint = hint
        field.enum_options = ENUM_OPTIONS.get(code)
        field.is_active = True

    if not remove_stale:
        return

    stale_fields = (
        await db.execute(
            select(StandardField).where(StandardField.field_code.not_in(CANONICAL_FIELD_CODES))
        )
    ).scalars().all()
    for field in stale_fields:
        await db.execute(
            delete(TemplateFieldMapping).where(
                TemplateFieldMapping.standard_field_id == field.id
            )
        )
        await db.execute(
            delete(ClaimFieldChangeLog).where(ClaimFieldChangeLog.standard_field_id == field.id)
        )
        await db.delete(field)
        logger.info("seed_field_removed", field_code=field.field_code)


async def sync_standard_catalog(db, *, remove_stale: bool = True) -> None:
    """仅同步信息域与标准字段库（不含演示账号等）。"""
    domain_map = await _sync_domains(db, remove_stale=remove_stale)
    await _sync_standard_fields(db, domain_map, remove_stale=remove_stale)


async def seed() -> None:
    async with async_session_factory() as db:
        # 管理员
        admin = (
            await db.execute(select(AdminUser).where(AdminUser.username == "admin"))
        ).scalar_one_or_none()
        if not admin:
            db.add(
                AdminUser(
                    username="admin",
                    password_hash=hash_password("admin123"),
                    real_name="超级管理员",
                    role="SUPER_ADMIN",
                )
            )
            logger.info("seed_admin_created")

        # 信息域 + 标准字段（以本文件为准全量同步）
        await sync_standard_catalog(db, remove_stale=True)

        # 示例保险公司
        company = (
            await db.execute(
                select(InsuranceCompany).where(InsuranceCompany.company_code == "DEMO_INS")
            )
        ).scalar_one_or_none()
        if not company:
            company = InsuranceCompany(
                company_code="DEMO_INS",
                company_name="示例保险有限公司",
                company_name_en="Demo Insurance Ltd.",
            )
            db.add(company)
            await db.flush()

        # 示例诊所 + 医生
        clinic = (
            await db.execute(select(Clinic).where(Clinic.clinic_code == "DEMO_CLINIC"))
        ).scalar_one_or_none()
        if not clinic:
            clinic = Clinic(
                clinic_code="DEMO_CLINIC",
                clinic_name="示例诊所",
                clinic_name_en="Demo Clinic",
                address="香港中环",
            )
            db.add(clinic)
            await db.flush()

        doctor = (
            await db.execute(select(Doctor).where(Doctor.login_account == "doctor"))
        ).scalar_one_or_none()
        if not doctor:
            doctor = Doctor(
                clinic_id=clinic.id,
                doctor_name="陈大文",
                doctor_name_en="Chan Tai Man",
                login_account="doctor",
                password_hash=hash_password("doctor123"),
            )
            db.add(doctor)
            await db.flush()
        elif not verify_password("doctor123", doctor.password_hash):
            # 开发环境：bcrypt 库升级后旧哈希可能失效，自动修复演示账号
            doctor.password_hash = hash_password("doctor123")

        # 确保演示医生拥有主诊所关联（兼容迁移前后）
        existing_link = (
            await db.execute(
                select(DoctorClinicLink).where(
                    DoctorClinicLink.doctor_id == doctor.id,
                    DoctorClinicLink.clinic_id == clinic.id,
                )
            )
        ).scalar_one_or_none()
        if not existing_link or not existing_link.is_primary or doctor.clinic_id != clinic.id:
            await ensure_primary_clinic_link(
                db, doctor_id=doctor.id, clinic_id=clinic.id
            )

        # 第二家演示诊所：用于联调「登录时选择本次诊所」
        clinic_b = (
            await db.execute(select(Clinic).where(Clinic.clinic_code == "DEMO_CLINIC_B"))
        ).scalar_one_or_none()
        if not clinic_b:
            clinic_b = Clinic(
                clinic_code="DEMO_CLINIC_B",
                clinic_name="示例诊所（尖沙咀）",
                clinic_name_en="Demo Clinic (TST)",
                address="香港尖沙咀",
            )
            db.add(clinic_b)
            await db.flush()

        clinic_b_link = (
            await db.execute(
                select(DoctorClinicLink).where(
                    DoctorClinicLink.doctor_id == doctor.id,
                    DoctorClinicLink.clinic_id == clinic_b.id,
                )
            )
        ).scalar_one_or_none()
        if not clinic_b_link:
            await link_clinic(db, doctor_id=doctor.id, clinic_id=clinic_b.id)

        # 诊所-保司关联
        for linked_clinic in (clinic, clinic_b):
            rel = (
                await db.execute(
                    select(ClinicInsuranceCompany).where(
                        ClinicInsuranceCompany.clinic_id == linked_clinic.id,
                        ClinicInsuranceCompany.company_id == company.id,
                    )
                )
            ).scalar_one_or_none()
            if not rel:
                db.add(
                    ClinicInsuranceCompany(
                        clinic_id=linked_clinic.id, company_id=company.id
                    )
                )

        await db.commit()
        logger.info("seed_done")


if __name__ == "__main__":
    configure_logging()
    asyncio.run(seed())
