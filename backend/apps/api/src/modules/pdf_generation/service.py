"""PDF 生成服务：模板测试填充 & 填报记录出 PDF。"""
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.exceptions import NotFoundException, ValidationException
from src.db.models import (
    ClaimSubmission,
    FieldTransformRule,
    StandardField,
    TemplateField,
)
from src.modules.pdf_generation.fill_engine import (
    FieldRenderContext,
    _apply_rule,
    _build_render_context,
    _field_code_map,
    _load_mapped_fields,
    _resolve_value,
    _transform_rule_map,
    fill_pdf_bytes,
    generate_filled_pdf,
    resolve_chinese_fontname,
)
from src.utils import storage

__all__ = [
    "build_generated_at",
    "generate_for_submission",
    "get_submission_pdf_bytes",
    "render_preview",
]


async def render_preview(
    db: AsyncSession, template_id: int, original_pdf: bytes, sample_values: dict[str, str]
) -> bytes:
    """按 field_code -> value 的样例值测试填充。"""
    fields = await _load_mapped_fields(db, template_id)
    sf_map = await _field_code_map(db)
    rule_map = await _transform_rule_map(db)
    render_fields: list[FieldRenderContext] = []
    for tf in fields:
        if tf.field_status != "MAPPED":
            continue
        m = tf.mapping
        if not m:
            continue
        value = _resolve_value(m, sf_map, sample_values)
        value = _apply_rule(value, m.transform_rule_id, rule_map)
        render_fields.append(
            _build_render_context(
                tf,
                value=value,
                checkbox_map_value=m.checkbox_map_value,
                signature_bytes=None,
                image_bytes=None,
            )
        )
    return fill_pdf_bytes(
        original_pdf,
        render_fields,
        submission_id=0,
        fontname=resolve_chinese_fontname(),
    )


async def generate_for_submission(
    db: AsyncSession, submission_id: int, clinic_id: int
) -> str:
    return await generate_filled_pdf(db, submission_id, clinic_id)


async def get_submission_pdf_bytes(
    db: AsyncSession, submission_id: int, clinic_id: int
) -> tuple[bytes, str]:
    submission = await db.get(ClaimSubmission, submission_id)
    if not submission or submission.clinic_id != clinic_id:
        raise NotFoundException("填报记录不存在")
    if not submission.generated_pdf_url:
        raise ValidationException("请先生成保单 PDF")
    try:
        pdf_bytes = storage.download_bytes(submission.generated_pdf_url)
    except Exception as exc:
        raise ValidationException("已生成的PDF无法读取，请重新生成") from exc
    filename = f"{submission.submission_no}.pdf"
    return pdf_bytes, filename


def build_generated_at() -> str:
    return datetime.now(UTC).isoformat()
