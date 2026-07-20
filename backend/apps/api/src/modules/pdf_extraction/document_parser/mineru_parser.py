"""MinerU 本地解析：PDF → Markdown（+ content_list.json 按页拆分）。"""
from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path

import httpx

from src.config import settings
from src.core.exceptions import ValidationException
from src.core.logging import get_logger
from src.modules.pdf_extraction.document_parser import DocumentParseResult, ParsedPageText
from src.modules.pdf_extraction.document_parser.markdown_adapter import (
    find_content_list_file,
    find_markdown_file,
    load_content_list_json,
    pages_from_content_list,
    split_markdown_by_page_markers,
)

logger = get_logger(__name__)


def _pdf_page_count(pdf_bytes: bytes) -> int:
    import fitz

    with fitz.open(stream=pdf_bytes, filetype="pdf") as doc:
        return doc.page_count


async def _parse_via_cli(pdf_bytes: bytes, *, task_id: str) -> tuple[Path, int]:
    page_count = _pdf_page_count(pdf_bytes)
    tmp_path = Path(tempfile.mkdtemp(prefix="mineru_in_"))
    output_dir = tmp_path / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    input_pdf = tmp_path / "input.pdf"
    input_pdf.write_bytes(pdf_bytes)

    cmd = [
        settings.MINERU_CLI,
        "-p",
        str(input_pdf),
        "-o",
        str(output_dir),
        "-b",
        settings.MINERU_BACKEND,
        "--dump-content-list",
    ]
    if settings.MINERU_LANG.strip():
        cmd.extend(["-l", settings.MINERU_LANG.strip()])

    logger.info("mineru_cli_start", task_id=task_id, backend=settings.MINERU_BACKEND)
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    try:
        _stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=settings.MINERU_TIMEOUT_S,
        )
    except TimeoutError as exc:
        proc.kill()
        await proc.wait()
        import shutil

        shutil.rmtree(tmp_path, ignore_errors=True)
        raise ValidationException(
            f"MinerU 解析超时（>{settings.MINERU_TIMEOUT_S}s），请稍后重试"
        ) from exc

    if proc.returncode != 0:
        err = (stderr or b"").decode("utf-8", errors="replace")[:2000]
        import shutil

        shutil.rmtree(tmp_path, ignore_errors=True)
        raise ValidationException(f"MinerU 解析失败：{err or 'unknown error'}")

    return output_dir, page_count


async def _parse_via_api(pdf_bytes: bytes, *, task_id: str) -> tuple[bytes, bytes | None, int]:
    page_count = _pdf_page_count(pdf_bytes)
    base = settings.MINERU_API_URL.rstrip("/")
    url = f"{base}/file_parse"
    timeout = httpx.Timeout(settings.MINERU_TIMEOUT_S, connect=30.0)

    async with httpx.AsyncClient(timeout=timeout) as client:
        files = {"files": ("document.pdf", pdf_bytes, "application/pdf")}
        data = {
            "backend": settings.MINERU_BACKEND,
            "return_md": "true",
        }
        if settings.MINERU_LANG.strip():
            data["lang"] = settings.MINERU_LANG.strip()

        logger.info("mineru_api_start", task_id=task_id, url=url)
        resp = await client.post(url, files=files, data=data)
        if resp.status_code >= 400:
            raise ValidationException(f"MinerU API 失败 ({resp.status_code}): {resp.text[:500]}")

        content_type = resp.headers.get("content-type", "")
        if "application/json" in content_type:
            payload = resp.json()
            md = (
                payload.get("md_content")
                or payload.get("markdown")
                or payload.get("content")
                or ""
            )
            if isinstance(md, dict):
                md = md.get("content") or ""
            if not isinstance(md, str) or not md.strip():
                raise ValidationException("MinerU API 未返回 Markdown 内容")
            cl = payload.get("content_list")
            cl_bytes = None
            if cl is not None:
                import json

                cl_bytes = json.dumps(cl, ensure_ascii=False).encode("utf-8")
            return md.encode("utf-8"), cl_bytes, page_count

        # 部分部署直接返回 text/markdown
        text = resp.text
        if not text.strip():
            raise ValidationException("MinerU API 返回空内容")
        return text.encode("utf-8"), None, page_count


def _build_result_from_outputs(
    *,
    output_dir: Path | None,
    markdown_bytes: bytes,
    content_list_bytes: bytes | None,
    page_count_hint: int,
    task_id: str,
) -> DocumentParseResult:
    markdown = markdown_bytes.decode("utf-8", errors="replace").strip()
    pages: list[ParsedPageText] = []

    if content_list_bytes:
        import json

        raw = json.loads(content_list_bytes.decode("utf-8"))
        content_list = raw if isinstance(raw, list) else []
        if isinstance(raw, dict):
            blocks = raw.get("content_list") or raw.get("blocks") or raw.get("data")
            content_list = blocks if isinstance(blocks, list) else []
        pages = pages_from_content_list(
            [x for x in content_list if isinstance(x, dict)],
            page_count_hint=page_count_hint,
        )

    if not pages and output_dir is not None:
        cl_path = find_content_list_file(output_dir)
        if cl_path is not None:
            pages = pages_from_content_list(
                load_content_list_json(cl_path),
                page_count_hint=page_count_hint,
            )

    if not pages and markdown:
        pages = split_markdown_by_page_markers(markdown, page_count_hint)

    if not pages and markdown:
        pages = [ParsedPageText(page_no=1, text=markdown, markdown=markdown)]

    if not markdown and pages:
        markdown = "\n\n".join(p.text for p in pages if p.text)

    if not markdown.strip():
        raise ValidationException("MinerU 未解析出可用 Markdown 文本")

    return DocumentParseResult(markdown=markdown, pages=pages, engine="mineru")


async def parse_pdf_with_mineru(pdf_bytes: bytes, *, task_id: str) -> DocumentParseResult:
    """调用本地 MinerU（CLI 或 HTTP API）将 PDF 转为 Markdown。"""
    if settings.MINERU_API_URL.strip():
        md_bytes, cl_bytes, page_count = await _parse_via_api(pdf_bytes, task_id=task_id)
        return _build_result_from_outputs(
            output_dir=None,
            markdown_bytes=md_bytes,
            content_list_bytes=cl_bytes,
            page_count_hint=page_count,
            task_id=task_id,
        )

    output_dir, page_count = await _parse_via_cli(pdf_bytes, task_id=task_id)
    try:
        md_path = find_markdown_file(output_dir)
        if md_path is None:
            raise ValidationException("MinerU 输出目录中未找到 .md 文件")
        md_bytes = md_path.read_bytes()
        cl_path = find_content_list_file(output_dir)
        cl_bytes = cl_path.read_bytes() if cl_path else None
        return _build_result_from_outputs(
            output_dir=output_dir,
            markdown_bytes=md_bytes,
            content_list_bytes=cl_bytes,
            page_count_hint=page_count,
            task_id=task_id,
        )
    finally:
        import shutil

        # output_dir 的父目录即 mineru_in_* 临时根
        shutil.rmtree(output_dir.parent, ignore_errors=True)
