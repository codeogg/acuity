"""PDF 模板解析：优先 AcroForm 表单域，其次版面启发式分析。

坐标统一为左上原点、y 向下(pt)，与 pdf.js / fitz / template_field 存储约定一致。
"""
from collections.abc import Callable
from dataclasses import dataclass, field

import fitz  # PyMuPDF
from pypdf import PdfReader

ProgressFn = Callable[[int, str], None]


@dataclass
class ParsedField:
    page_no: int
    field_type: str
    pos_x: float
    pos_y: float
    width: float
    height: float
    recognize_source: str
    confidence_score: float
    pdf_field_name: str | None = None
    field_label_raw: str | None = None


@dataclass
class ParseResult:
    page_count: int
    page_width: float
    page_height: float
    fields: list[ParsedField] = field(default_factory=list)
    has_acroform: bool = False


_WIDGET_TYPE_MAP = {
    fitz.PDF_WIDGET_TYPE_TEXT: "text",
    fitz.PDF_WIDGET_TYPE_CHECKBOX: "checkbox",
    fitz.PDF_WIDGET_TYPE_RADIOBUTTON: "radio",
    fitz.PDF_WIDGET_TYPE_SIGNATURE: "signature",
    fitz.PDF_WIDGET_TYPE_COMBOBOX: "text",
    fitz.PDF_WIDGET_TYPE_LISTBOX: "text",
}


def _map_widget_type(widget_type: int) -> str:
    return _WIDGET_TYPE_MAP.get(widget_type, "text")


def parse_pdf_template(
    pdf_bytes: bytes, on_progress: ProgressFn | None = None
) -> ParseResult:
    def prog(percent: int, message: str) -> None:
        if on_progress:
            on_progress(percent, message)

    prog(5, "正在加载 PDF 文件")
    reader = PdfReader_from_bytes(pdf_bytes)
    has_form = bool(reader.get_fields())
    if has_form:
        prog(15, "检测到 PDF 表单域")
        result = _parse_acroform_fields(pdf_bytes, on_progress=on_progress)
        result.has_acroform = True
        return result
    return _parse_via_layout_analysis(pdf_bytes, on_progress=on_progress)


def PdfReader_from_bytes(pdf_bytes: bytes) -> PdfReader:
    import io

    return PdfReader(io.BytesIO(pdf_bytes))


def _parse_acroform_fields(
    pdf_bytes: bytes, on_progress: ProgressFn | None = None
) -> ParseResult:
    def prog(percent: int, message: str) -> None:
        if on_progress:
            on_progress(percent, message)

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    fields: list[ParsedField] = []
    first = doc[0]
    prog(20, "正在提取表单域字段")
    for page_no, page in enumerate(doc, start=1):
        for widget in page.widgets() or []:
            rect = widget.rect
            fields.append(
                ParsedField(
                    page_no=page_no,
                    pdf_field_name=widget.field_name,
                    field_type=_map_widget_type(widget.field_type),
                    pos_x=float(rect.x0),
                    pos_y=float(rect.y0),
                    width=float(rect.width),
                    height=float(rect.height),
                    recognize_source="AUTO_PDF",
                    confidence_score=100.0,
                )
            )
    prog(75, f"已提取 {len(fields)} 个表单域")
    result = ParseResult(
        page_count=doc.page_count,
        page_width=float(first.rect.width),
        page_height=float(first.rect.height),
        fields=fields,
    )
    doc.close()
    return result


def _parse_via_layout_analysis(
    pdf_bytes: bytes, on_progress: ProgressFn | None = None
) -> ParseResult:
    """扫描件/无表单域兜底：基于文本块位置做启发式候选。"""
    def prog(percent: int, message: str) -> None:
        if on_progress:
            on_progress(percent, message)

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    fields: list[ParsedField] = []
    first = doc[0]
    total_pages = doc.page_count
    for page_no, page in enumerate(doc, start=1):
        prog(
            20 + int(60 * page_no / max(total_pages, 1)),
            f"正在分析第 {page_no}/{total_pages} 页",
        )
        blocks = page.get_text("blocks")  # (x0, y0, x1, y1, text, block_no, block_type)
        for b in blocks:
            x0, y0, x1, y1, text = b[0], b[1], b[2], b[3], (b[4] or "").strip()
            if not text or len(text) > 40:
                continue
            # 标签后方留白作为候选输入框
            candidate_x = x1 + 4
            candidate_w = max(60.0, page.rect.width - candidate_x - 20)
            fields.append(
                ParsedField(
                    page_no=page_no,
                    field_label_raw=text[:255],
                    field_type="text",
                    pos_x=float(candidate_x),
                    pos_y=float(y0),
                    width=float(candidate_w),
                    height=float(max(12.0, y1 - y0)),
                    recognize_source="AUTO_PDF",
                    confidence_score=40.0,  # 低置信度，触发 AI 辅助
                )
            )
    result = ParseResult(
        page_count=doc.page_count,
        page_width=float(first.rect.width),
        page_height=float(first.rect.height),
        fields=fields,
    )
    doc.close()
    return result


def render_page_png(pdf_bytes: bytes, page_no: int, zoom: float = 2.0) -> bytes:
    """渲染指定页为 PNG（供 AI 视觉识别 / 前端预览）。page_no 从 1 开始。"""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[page_no - 1]
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
    data = pix.tobytes("png")
    doc.close()
    return data
