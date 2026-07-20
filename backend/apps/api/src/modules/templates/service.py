import secrets
from datetime import UTC, datetime

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.exceptions import (
    ConflictException,
    NotFoundException,
    ValidationException,
)
from src.db.models import (
    ClaimSubmission,
    ClinicPolicyTemplate,
    PolicyTemplate,
    StandardField,
    TemplateField,
    TemplateFieldMapping,
)
from src.modules.templates.schemas import (
    FieldIgnoreSave,
    FieldMappingSave,
    FieldRestoreSave,
    MissingRequiredFieldOut,
    ParseProgressOut,
    PublishPreviewOut,
    TemplateFieldCreate,
    TemplateFieldUpdate,
)
from src.tasks.parse_progress import get_progress_cached
from src.utils import storage

MAX_UPLOAD_BYTES = 20 * 1024 * 1024


async def create_template(
    db: AsyncSession,
    *,
    company_id: int,
    template_name: str,
    filename: str,
    file_bytes: bytes,
    created_by: int | None,
) -> PolicyTemplate:
    if not filename.lower().endswith(".pdf"):
        raise ValidationException("仅支持 PDF 文件")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValidationException("文件大小不能超过 20MB")

    template_code = f"TPL{secrets.token_hex(4).upper()}"
    key = f"templates/{template_code}/original.pdf"
    url = storage.upload_bytes(file_bytes, key, content_type="application/pdf")

    template = PolicyTemplate(
        company_id=company_id,
        template_name=template_name,
        template_code=template_code,
        original_pdf_url=url,
        parse_status="PENDING",
        created_by=created_by,
    )
    db.add(template)
    await db.flush()
    return template


async def list_templates(
    db: AsyncSession, *, company_id: int | None
) -> list[PolicyTemplate]:
    stmt = select(PolicyTemplate).order_by(PolicyTemplate.id.desc())
    if company_id:
        stmt = stmt.where(PolicyTemplate.company_id == company_id)
    return list((await db.execute(stmt)).scalars().all())


async def get_template(db: AsyncSession, template_id: int) -> PolicyTemplate:
    template = await db.get(PolicyTemplate, template_id)
    if not template:
        raise NotFoundException("模板不存在")
    return template


async def update_template(
    db: AsyncSession,
    template_id: int,
    *,
    template_name: str | None = None,
    company_id: int | None = None,
) -> PolicyTemplate:
    template = await get_template(db, template_id)
    if template_name is not None:
        template.template_name = template_name
    if company_id is not None:
        template.company_id = company_id
    await db.flush()
    return template


async def replace_template_file(
    db: AsyncSession,
    template_id: int,
    *,
    filename: str,
    file_bytes: bytes,
) -> PolicyTemplate:
    """PENDING 状态下替换 PDF 附件并重新触发解析。"""
    template = await get_template(db, template_id)
    if template.parse_status != "PENDING":
        raise ValidationException("仅待解析状态的模板可替换附件")
    if not filename.lower().endswith(".pdf"):
        raise ValidationException("仅支持 PDF 文件")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise ValidationException("文件大小不能超过 20MB")

    await db.execute(
        delete(TemplateField).where(TemplateField.template_id == template_id)
    )
    key = f"templates/{template.template_code}/original.pdf"
    url = storage.upload_bytes(file_bytes, key, content_type="application/pdf")
    template.original_pdf_url = url
    template.parse_status = "PENDING"
    template.parse_progress = 0
    template.parse_message = None
    template.parse_job_id = None
    template.parse_error = None
    template.page_count = 1
    template.page_width = None
    template.page_height = None
    await db.flush()
    return template


async def prepare_reparse(db: AsyncSession, template_id: int) -> PolicyTemplate:
    """重新解析：保留 PDF，清空字段并重置解析状态（不入队）。"""
    template = await get_template(db, template_id)
    if template.parse_status == "PUBLISHED" and template.is_active:
        raise ValidationException("已发布的模板请先停用后再重新解析")
    await db.execute(
        delete(TemplateField).where(TemplateField.template_id == template_id)
    )
    template.parse_status = "PENDING"
    template.parse_progress = 0
    template.parse_message = "等待解析"
    template.parse_job_id = None
    template.parse_error = None
    template.page_count = 1
    template.page_width = None
    template.page_height = None
    await db.flush()
    return template


async def get_parse_progress(db: AsyncSession, template_id: int) -> ParseProgressOut:
    template = await get_template(db, template_id)
    cached = await get_progress_cached(template_id)
    if cached and template.parse_status in ("PENDING", "PARSING"):
        return ParseProgressOut(
            percent=int(cached.get("percent", 0)),
            message=cached.get("message"),
            status=template.parse_status,
        )
    if template.parse_status in ("AUTO_PARSED", "AI_ASSISTED", "ANNOTATED", "PUBLISHED"):
        return ParseProgressOut(
            percent=100,
            message=template.parse_message or "解析完成",
            status=template.parse_status,
        )
    if template.parse_status == "PARSE_FAILED":
        return ParseProgressOut(
            percent=0,
            message=template.parse_message or template.parse_error or "解析失败",
            status=template.parse_status,
        )
    return ParseProgressOut(
        percent=template.parse_progress,
        message=template.parse_message or "等待解析",
        status=template.parse_status,
    )


async def delete_template(db: AsyncSession, template_id: int) -> None:
    """删除模板。被理赔单使用时拒绝；字段/映射随 DB 级联删除，先解除诊所绑定。"""
    exists = (
        await db.execute(
            select(PolicyTemplate.id).where(PolicyTemplate.id == template_id)
        )
    ).first()
    if not exists:
        raise NotFoundException("模板不存在")

    claim_count = (
        await db.execute(
            select(func.count())
            .select_from(ClaimSubmission)
            .where(ClaimSubmission.template_id == template_id)
        )
    ).scalar_one()
    if claim_count:
        raise ConflictException("该模板已被理赔单使用，无法删除")

    await db.execute(
        delete(ClinicPolicyTemplate).where(
            ClinicPolicyTemplate.template_id == template_id
        )
    )
    await db.execute(delete(PolicyTemplate).where(PolicyTemplate.id == template_id))
    await db.flush()


async def _get_field_with_mapping(db: AsyncSession, field_id: int) -> TemplateField:
    """加载字段并预取 mapping，供 TemplateFieldOut 序列化。"""
    field = (
        await db.execute(
            select(TemplateField)
            .where(TemplateField.id == field_id)
            .options(selectinload(TemplateField.mapping))
        )
    ).scalar_one_or_none()
    if not field:
        raise NotFoundException("字段不存在")
    return field


async def list_fields(db: AsyncSession, template_id: int) -> list[TemplateField]:
    await get_template(db, template_id)
    stmt = (
        select(TemplateField)
        .where(TemplateField.template_id == template_id)
        .options(selectinload(TemplateField.mapping))
        .order_by(TemplateField.page_no, TemplateField.id)
    )
    return list((await db.execute(stmt)).scalars().all())


async def create_field(
    db: AsyncSession, template_id: int, data: TemplateFieldCreate
) -> TemplateField:
    await get_template(db, template_id)
    field = TemplateField(
        template_id=template_id,
        recognize_source="MANUAL",
        confidence_score=None,
        is_confirmed=False,
        **data.model_dump(),
    )
    db.add(field)
    await db.flush()
    return await _get_field_with_mapping(db, field.id)


async def update_field(
    db: AsyncSession, field_id: int, data: TemplateFieldUpdate
) -> TemplateField:
    """乐观锁更新：row_version 不匹配返回 409。"""
    values = data.model_dump(exclude_unset=True, exclude={"row_version"})
    result = await db.execute(
        update(TemplateField)
        .where(
            TemplateField.id == field_id,
            TemplateField.row_version == data.row_version,
        )
        .values(**values, row_version=TemplateField.row_version + 1)
    )
    if result.rowcount == 0:
        exists = await db.get(TemplateField, field_id)
        if not exists:
            raise NotFoundException("字段不存在")
        raise ConflictException("该字段已被他人修改，请刷新后重试")
    await db.flush()
    return await _get_field_with_mapping(db, field_id)


async def delete_field(db: AsyncSession, field_id: int) -> None:
    field = await db.get(TemplateField, field_id)
    if not field:
        raise NotFoundException("字段不存在")
    await db.delete(field)
    await db.flush()


async def save_mapping(
    db: AsyncSession, field_id: int, data: FieldMappingSave, admin_id: int
) -> TemplateFieldMapping:
    field = await db.get(TemplateField, field_id)
    if not field:
        raise NotFoundException("字段不存在")
    if (
        data.standard_field_id is None
        and not data.fixed_value
        and not (data.template_specific_field_code and data.template_specific_ai_hint)
    ):
        raise ValidationException("映射需至少提供标准字段、固定值或模板专属AI提取信息")

    existing = (
        await db.execute(
            select(TemplateFieldMapping).where(
                TemplateFieldMapping.template_field_id == field_id
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.standard_field_id = data.standard_field_id
        existing.fixed_value = data.fixed_value
        existing.checkbox_map_value = data.checkbox_map_value
        existing.transform_rule_id = data.transform_rule_id
        existing.template_specific_field_code = data.template_specific_field_code
        existing.template_specific_ai_hint = data.template_specific_ai_hint
        existing.annotated_by = admin_id
        existing.annotated_at = datetime.now(UTC)
        mapping = existing
    else:
        mapping = TemplateFieldMapping(
            template_field_id=field_id,
            standard_field_id=data.standard_field_id,
            fixed_value=data.fixed_value,
            checkbox_map_value=data.checkbox_map_value,
            transform_rule_id=data.transform_rule_id,
            template_specific_field_code=data.template_specific_field_code,
            template_specific_ai_hint=data.template_specific_ai_hint,
            annotated_by=admin_id,
            annotated_at=datetime.now(UTC),
        )
        db.add(mapping)
    try:
        await db.flush()
    except IntegrityError as exc:
        raise ValidationException("映射数据不合法") from exc
    if data.confirm:
        field.is_confirmed = True
        field.field_status = "MAPPED"
        field.ignore_reason = None
        await db.flush()
    return mapping


async def ignore_field(
    db: AsyncSession, field_id: int, data: FieldIgnoreSave
) -> TemplateField:
    """标记字段为忽略，不参与填报。"""
    field = await db.get(TemplateField, field_id)
    if not field:
        raise NotFoundException("字段不存在")
    if field.field_status == "IGNORED":
        return await _get_field_with_mapping(db, field_id)

    result = await db.execute(
        update(TemplateField)
        .where(
            TemplateField.id == field_id,
            TemplateField.row_version == data.row_version,
        )
        .values(
            field_status="IGNORED",
            ignore_reason=data.reason,
            is_confirmed=False,
            row_version=TemplateField.row_version + 1,
        )
    )
    if result.rowcount == 0:
        exists = await db.get(TemplateField, field_id)
        if not exists:
            raise NotFoundException("字段不存在")
        raise ConflictException("该字段已被他人修改，请刷新后重试")

    existing_mapping = (
        await db.execute(
            select(TemplateFieldMapping).where(
                TemplateFieldMapping.template_field_id == field_id
            )
        )
    ).scalar_one_or_none()
    if existing_mapping:
        await db.delete(existing_mapping)
    await db.flush()
    return await _get_field_with_mapping(db, field_id)


async def restore_field(
    db: AsyncSession, field_id: int, data: FieldRestoreSave
) -> TemplateField:
    """将已忽略字段恢复为待处理。"""
    field = await db.get(TemplateField, field_id)
    if not field:
        raise NotFoundException("字段不存在")
    if field.field_status != "IGNORED":
        return await _get_field_with_mapping(db, field_id)

    result = await db.execute(
        update(TemplateField)
        .where(
            TemplateField.id == field_id,
            TemplateField.row_version == data.row_version,
        )
        .values(
            field_status="PENDING",
            ignore_reason=None,
            is_confirmed=False,
            row_version=TemplateField.row_version + 1,
        )
    )
    if result.rowcount == 0:
        exists = await db.get(TemplateField, field_id)
        if not exists:
            raise NotFoundException("字段不存在")
        raise ConflictException("该字段已被他人修改，请刷新后重试")
    await db.flush()
    return await _get_field_with_mapping(db, field_id)


async def get_mapped_standard_field_codes(
    db: AsyncSession, template_id: int
) -> set[str]:
    stmt = (
        select(StandardField.field_code)
        .join(
            TemplateFieldMapping,
            TemplateFieldMapping.standard_field_id == StandardField.id,
        )
        .join(TemplateField, TemplateField.id == TemplateFieldMapping.template_field_id)
        .where(
            TemplateField.template_id == template_id,
            TemplateField.field_status == "MAPPED",
        )
    )
    return set((await db.execute(stmt)).scalars().all())


async def check_missing_required_fields(
    db: AsyncSession, template_id: int
) -> list[MissingRequiredFieldOut]:
    mapped_codes = await get_mapped_standard_field_codes(db, template_id)
    required = (
        await db.execute(
            select(StandardField).where(StandardField.is_required.is_(True))
        )
    ).scalars().all()
    return [
        MissingRequiredFieldOut(field_code=f.field_code, field_name=f.field_name)
        for f in required
        if f.field_code not in mapped_codes
    ]


async def get_publish_preview(db: AsyncSession, template_id: int) -> PublishPreviewOut:
    await get_template(db, template_id)
    fields = await list_fields(db, template_id)
    total = len(fields)
    pending = sum(1 for f in fields if f.field_status == "PENDING")
    processed = total - pending
    missing = await check_missing_required_fields(db, template_id)
    return PublishPreviewOut(
        total_count=total,
        processed_count=processed,
        pending_count=pending,
        missing_required=missing,
    )


async def publish_template(db: AsyncSession, template_id: int) -> PolicyTemplate:
    template = await get_template(db, template_id)
    fields = await list_fields(db, template_id)
    if not fields:
        raise ValidationException("模板没有任何字段，无法发布")
    unhandled = [f for f in fields if f.field_status == "PENDING"]
    if unhandled:
        raise ValidationException(
            f"仍有 {len(unhandled)} 个字段未处理（既未映射也未标记忽略），无法发布"
        )

    old_active = (
        await db.execute(
            select(PolicyTemplate).where(
                PolicyTemplate.template_code == template.template_code,
                PolicyTemplate.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()

    if old_active and old_active.id != template.id:
        has_history = (
            await db.execute(
                select(ClaimSubmission.id)
                .where(ClaimSubmission.template_id == old_active.id)
                .limit(1)
            )
        ).first()
        if has_history:
            template.version = _increment_version(old_active.version)
        old_active.is_active = False

    template.is_active = True
    template.parse_status = "PUBLISHED"
    await db.flush()
    return template


def _increment_version(version: str) -> str:
    try:
        num = int(version.lstrip("Vv"))
        return f"V{num + 1}"
    except ValueError:
        return "V2"
