"""MinerU Markdown 适配器测试。"""
from src.modules.pdf_extraction.document_parser import ParsedPageText
from src.modules.pdf_extraction.document_parser.markdown_adapter import (
    markdown_to_step3_pages,
    pages_from_content_list,
    split_markdown_by_page_markers,
)


def test_pages_from_content_list_groups_by_page_idx():
    content = [
        {"type": "text", "text": "Page0-A", "page_idx": 0},
        {"type": "text", "text": "Page1-A", "page_idx": 1},
        {"type": "text", "text": "Page1-B", "page_idx": 1},
    ]
    pages = pages_from_content_list(content, page_count_hint=2)
    assert len(pages) == 2
    assert pages[0].page_no == 1
    assert "Page0-A" in pages[0].text
    assert "Page1-A" in pages[1].text and "Page1-B" in pages[1].text


def test_split_markdown_by_page_markers():
    md = "<!-- page 1 -->\nFirst\n<!-- page 2 -->\nSecond"
    pages = split_markdown_by_page_markers(md, page_count_hint=2)
    assert [p.page_no for p in pages] == [1, 2]
    assert pages[0].text == "First"
    assert pages[1].text == "Second"


def test_markdown_to_step3_pages_creates_blocks():
    pages = markdown_to_step3_pages(
        task_id="T1",
        pages=[ParsedPageText(page_no=1, text="Line1\n\nLine2", markdown="Line1\n\nLine2")],
    )
    assert len(pages) == 1
    assert len(pages[0].blocks) == 2
    assert pages[0].blocks[0].text == "Line1"
