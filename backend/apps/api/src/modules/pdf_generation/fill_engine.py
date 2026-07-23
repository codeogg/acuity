"""PDF 填充引擎：按规格文档将标准字段值绘制到模板 PDF 上。

坐标：template_field 存左上原点(pt)，与 fitz 绘制坐标一致。
"""
from __future__ import annotations

from dataclasses import dataclass

import fitz
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.exceptions import NotFoundException, ValidationException
from src.core.logging import get_logger
from src.db.models import (
    ClaimSubmission,
    Doctor,
    FieldTransformRule,
    PolicyTemplate,
    StandardField,
    TemplateField,
)
from src.modules.pdf_generation.transforms import apply_transform
from src.utils import storage

logger = get_logger(__name__)

DEFAULT_START_FONTSIZE = 10.0
MIN_FONTSIZE = 6.0
FONT_TRADITIONAL = "china-ts"
FONT_SIMPLIFIED = "china-s"
# 英文/数字用 Helvetica：内置 CJK 字体的拉丁字形字距过宽，观感差
FONT_LATIN = "helv"

_font_cache: dict[str, fitz.Font] = {}


def _get_font(fontname: str) -> fitz.Font:
    font = _font_cache.get(fontname)
    if font is None:
        font = fitz.Font(fontname)
        _font_cache[fontname] = font
    return font


def _needs_cjk_font(ch: str) -> bool:
    """CJK 表意文字、假名、全角符号等需要中文字体渲染。"""
    return ord(ch) >= 0x2E80


def split_font_runs(text: str, cjk_fontname: str) -> list[tuple[str, str]]:
    """按 CJK/拉丁 把文本切成 (片段, 字体名) 序列。"""
    runs: list[tuple[str, str]] = []
    for ch in text:
        fontname = cjk_fontname if _needs_cjk_font(ch) else FONT_LATIN
        if runs and runs[-1][1] == fontname:
            runs[-1] = (runs[-1][0] + ch, fontname)
        else:
            runs.append((ch, fontname))
    return runs


def text_width(text: str, fontsize: float, cjk_fontname: str) -> float:
    return sum(
        _get_font(fontname).text_length(run, fontsize)
        for run, fontname in split_font_runs(text, cjk_fontname)
    )


def draw_text_runs(
    page: fitz.Page,
    point: fitz.Point,
    text: str,
    fontsize: float,
    cjk_fontname: str,
) -> None:
    x = point.x
    for run, fontname in split_font_runs(text, cjk_fontname):
        page.insert_text(
            fitz.Point(x, point.y), run, fontname=fontname, fontsize=fontsize
        )
        x += _get_font(fontname).text_length(run, fontsize)


@dataclass
class FieldRenderContext:
    page_no: int
    field_type: str
    rect: fitz.Rect
    value: str | None
    checkbox_map_value: str | None = None
    font_size: float = DEFAULT_START_FONTSIZE
    image_bytes: bytes | None = None


def resolve_chinese_fontname(*, use_simplified: bool = False) -> str:
    """按诊所语言习惯选择简体/繁体字体。"""
    return FONT_SIMPLIFIED if use_simplified else FONT_TRADITIONAL


def truncate_to_width(text: str, max_width: float, fontsize: float, fontname: str) -> str:
    if text_width(text, fontsize, fontname) <= max_width:
        return text
    lo, hi = 0, len(text)
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if text_width(text[:mid], fontsize, fontname) <= max_width:
            lo = mid
        else:
            hi = mid - 1
    return text[:lo]


def fit_text_in_box(
    page: fitz.Page,
    rect: fitz.Rect,
    text: str,
    fontname: str,
    *,
    start_fontsize: float = DEFAULT_START_FONTSIZE,
    min_fontsize: float = MIN_FONTSIZE,
    submission_id: int | None = None,
) -> None:
    fontsize = start_fontsize
    while fontsize >= min_fontsize:
        if text_width(text, fontsize, fontname) <= rect.width:
            draw_text_runs(
                page, fitz.Point(rect.x0, rect.y1 - 2), text, fontsize, fontname
            )
            return
        fontsize -= 0.5
    ellipsis_width = text_width("…", min_fontsize, fontname)
    truncated = truncate_to_width(
        text, max(rect.width - ellipsis_width, 0), min_fontsize, fontname
    )
    draw_text_runs(
        page,
        fitz.Point(rect.x0, rect.y1 - 2),
        truncated + "…",
        min_fontsize,
        fontname,
    )
    logger.warning("field_content_truncated", submission_id=submission_id, text=text)


def draw_check_mark(page: fitz.Page, rect: fitz.Rect) -> None:
    page.draw_line(
        fitz.Point(rect.x0, rect.y0),
        fitz.Point(rect.x1, rect.y1),
        color=(0, 0, 0),
        width=1.2,
    )
    page.draw_line(
        fitz.Point(rect.x0, rect.y1),
        fitz.Point(rect.x1, rect.y0),
        color=(0, 0, 0),
        width=1.2,
    )


def _download_image_bytes(url: str | None, *, submission_id: int | None = None) -> bytes | None:
    if not url:
        return None
    try:
        if url.startswith("http://") or url.startswith("https://"):
            import httpx

            resp = httpx.get(url, timeout=10.0, follow_redirects=True)
            resp.raise_for_status()
            return resp.content
        return storage.download_bytes(url)
    except Exception as exc:
        logger.warning(
            "image_download_failed",
            submission_id=submission_id,
            url=url,
            error=str(exc),
        )
        return None


def render_field(
    page: fitz.Page,
    rect: fitz.Rect,
    field_type: str,
    value: str | None,
    *,
    checkbox_map_value: str | None = None,
    image_bytes: bytes | None = None,
    fontname: str = FONT_TRADITIONAL,
    start_fontsize: float = DEFAULT_START_FONTSIZE,
    submission_id: int | None = None,
) -> None:
    if field_type in ("checkbox", "radio"):
        if value is not None and str(value) == str(checkbox_map_value):
            draw_check_mark(page, rect)
        return

    if field_type == "signature":
        if image_bytes:
            page.insert_image(rect, stream=image_bytes)
        return

    if field_type == "image":
        if image_bytes:
            page.insert_image(rect, stream=image_bytes)
        return

    text = "" if value is None else str(value)
    if not text:
        return
    fit_text_in_box(
        page,
        rect,
        text,
        fontname,
        start_fontsize=start_fontsize,
        submission_id=submission_id,
    )


def fill_pdf_bytes(
    original_pdf_bytes: bytes,
    fields: list[FieldRenderContext],
    *,
    submission_id: int,
    fontname: str = FONT_TRADITIONAL,
) -> bytes:
    try:
        doc = fitz.open(stream=original_pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise ValidationException("模板原始PDF无法打开，请联系管理员检查模板") from exc

    for field in fields:
        if field.page_no < 1 or field.page_no > doc.page_count:
            continue
        page = doc[field.page_no - 1]
        render_field(
            page,
            field.rect,
            field.field_type,
            field.value,
            checkbox_map_value=field.checkbox_map_value,
            image_bytes=field.image_bytes,
            fontname=fontname,
            start_fontsize=field.font_size,
            submission_id=submission_id,
        )

    output_bytes = doc.tobytes()
    doc.close()
    return output_bytes


async def _load_mapped_fields(db: AsyncSession, template_id: int) -> list[TemplateField]:
    stmt = (
        select(TemplateField)
        .where(TemplateField.template_id == template_id)
        .options(selectinload(TemplateField.mapping))
    )
    return list((await db.execute(stmt)).scalars().all())


async def _field_code_map(db: AsyncSession) -> dict[int, StandardField]:
    rows = (await db.execute(select(StandardField))).scalars().all()
    return {f.id: f for f in rows}


async def _transform_rule_map(db: AsyncSession) -> dict[int, FieldTransformRule]:
    rows = (await db.execute(select(FieldTransformRule))).scalars().all()
    return {r.id: r for r in rows}


def _resolve_value(
    mapping,
    sf_map: dict[int, StandardField],
    final_field_values: dict,
) -> str | None:
    if mapping.fixed_value is not None:
        return mapping.fixed_value
    if mapping.template_specific_field_code:
        raw = final_field_values.get(mapping.template_specific_field_code)
        if raw is None:
            return None
        return str(raw)
    if mapping.standard_field_id is None:
        return None
    sf = sf_map.get(mapping.standard_field_id)
    if not sf:
        return None
    raw = final_field_values.get(sf.field_code)
    if raw is None:
        return None
    return str(raw)


def _apply_rule(
    value: str | None,
    rule_id: int | None,
    rule_map: dict[int, FieldTransformRule],
) -> str | None:
    if value is None or rule_id is None:
        return value
    rule = rule_map.get(rule_id)
    if not rule:
        return value
    return apply_transform(value, rule.rule_type, rule.rule_config)


def _build_render_context(
    tf: TemplateField,
    *,
    value: str | None,
    checkbox_map_value: str | None,
    signature_bytes: bytes | None,
    image_bytes: bytes | None,
) -> FieldRenderContext:
    return FieldRenderContext(
        page_no=tf.page_no,
        field_type=tf.field_type,
        rect=fitz.Rect(
            float(tf.pos_x),
            float(tf.pos_y),
            float(tf.pos_x) + float(tf.width),
            float(tf.pos_y) + float(tf.height),
        ),
        value=value,
        checkbox_map_value=checkbox_map_value,
        font_size=float(tf.font_size or DEFAULT_START_FONTSIZE),
        image_bytes=(
            signature_bytes
            if tf.field_type == "signature"
            else image_bytes
            if tf.field_type == "image"
            else None
        ),
    )


async def generate_filled_pdf(
    db: AsyncSession,
    submission_id: int,
    clinic_id: int,
    *,
    use_simplified_font: bool = False,
) -> str:
    """主流程：加载模板 → 校验必填 → 渲染 → 上传 → 更新 generated_pdf_url。"""
    submission = await db.get(ClaimSubmission, submission_id)
    if not submission or submission.clinic_id != clinic_id:
        raise NotFoundException("填报记录不存在")

    template = await db.get(PolicyTemplate, submission.template_id)
    if not template:
        raise NotFoundException("模板不存在")

    try:
        original_pdf_bytes = storage.download_bytes(template.original_pdf_url)
    except Exception as exc:
        raise ValidationException("模板原始PDF无法打开，请联系管理员检查模板") from exc

    mappings = await _load_mapped_fields(db, submission.template_id)
    sf_map = await _field_code_map(db)
    rule_map = await _transform_rule_map(db)
    final_values: dict = submission.final_field_values or {}

    doctor = await db.get(Doctor, submission.doctor_id)
    signature_bytes = None
    if doctor and doctor.signature_url:
        signature_bytes = _download_image_bytes(
            doctor.signature_url, submission_id=submission.id
        )

    render_fields: list[FieldRenderContext] = []

    for tf in mappings:
        if tf.field_status != "MAPPED":
            continue
        mapping = tf.mapping
        if not mapping:
            continue

        value = _resolve_value(mapping, sf_map, final_values)
        # 必填缺失由医生端核对页提示；确认后仍按已有值生成 PDF（空值跳过填充）
        value = _apply_rule(value, mapping.transform_rule_id, rule_map)

        image_bytes = None
        if tf.field_type == "image" and value:
            image_bytes = _download_image_bytes(value, submission_id=submission.id)

        render_fields.append(
            _build_render_context(
                tf,
                value=value,
                checkbox_map_value=mapping.checkbox_map_value,
                signature_bytes=signature_bytes,
                image_bytes=image_bytes,
            )
        )

    fontname = resolve_chinese_fontname(use_simplified=use_simplified_font)
    output_bytes = fill_pdf_bytes(
        original_pdf_bytes,
        render_fields,
        submission_id=submission.id,
        fontname=fontname,
    )

    output_path = f"generated/{submission.submission_no}.pdf"
    pdf_url = storage.upload_bytes(output_bytes, output_path, content_type="application/pdf")
    submission.generated_pdf_url = pdf_url
    await db.flush()
    return pdf_url
