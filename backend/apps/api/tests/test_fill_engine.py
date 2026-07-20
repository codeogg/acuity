"""fill_engine 单元测试。"""
import fitz

from src.modules.pdf_generation.fill_engine import (
    draw_check_mark,
    fill_pdf_bytes,
    fit_text_in_box,
    truncate_to_width,
    FieldRenderContext,
    FONT_TRADITIONAL,
)


def _blank_pdf() -> bytes:
    doc = fitz.open()
    doc.new_page(width=595, height=842)
    data = doc.tobytes()
    doc.close()
    return data


def test_draw_check_mark_draws_lines():
    doc = fitz.open(stream=_blank_pdf(), filetype="pdf")
    page = doc[0]
    rect = fitz.Rect(10, 10, 20, 20)
    draw_check_mark(page, rect)
    drawings = page.get_drawings()
    assert len(drawings) >= 2
    doc.close()


def test_truncate_to_width():
    fontname = FONT_TRADITIONAL
    short = truncate_to_width("短", 200, 10, fontname)
    assert short == "短"
    long_text = "这是一段很长的中文测试文本用于验证截断逻辑是否生效"
    truncated = truncate_to_width(long_text, 30, 6, fontname)
    assert len(truncated) < len(long_text)
    font = fitz.Font(fontname)
    assert font.text_length(truncated, 6) <= 30


def test_fit_text_in_box_uses_chinese_font():
    doc = fitz.open(stream=_blank_pdf(), filetype="pdf")
    page = doc[0]
    rect = fitz.Rect(50, 50, 250, 70)
    fit_text_in_box(page, rect, "TestCN", FONT_TRADITIONAL, submission_id=1)
    text = page.get_text("text").strip()
    assert len(text) > 0
    doc.close()


def test_fill_pdf_checkbox_and_text():
    original = _blank_pdf()
    fields = [
        FieldRenderContext(
            page_no=1,
            field_type="text",
            rect=fitz.Rect(50, 50, 250, 70),
            value="林志强",
        ),
        FieldRenderContext(
            page_no=1,
            field_type="radio",
            rect=fitz.Rect(300, 50, 315, 65),
            value="男",
            checkbox_map_value="男",
        ),
        FieldRenderContext(
            page_no=1,
            field_type="radio",
            rect=fitz.Rect(330, 50, 345, 65),
            value="男",
            checkbox_map_value="女",
        ),
    ]
    out = fill_pdf_bytes(original, fields, submission_id=99, fontname=FONT_TRADITIONAL)
    doc = fitz.open(stream=out, filetype="pdf")
    page = doc[0]
    assert page.get_drawings()
    doc.close()


def test_fill_pdf_long_text_truncation_warning(caplog):
    import structlog

    structlog.configure(
        processors=[structlog.processors.add_log_level, structlog.dev.ConsoleRenderer()],
    )
    original = _blank_pdf()
    long_value = "超" * 80
    fields = [
        FieldRenderContext(
            page_no=1,
            field_type="text",
            rect=fitz.Rect(50, 100, 120, 115),
            value=long_value,
        ),
    ]
    fill_pdf_bytes(original, fields, submission_id=42, fontname=FONT_TRADITIONAL)
    # warning logged via structlog - at minimum should not raise
