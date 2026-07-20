"""Step3 OCR 单测。"""
import pytest

from src.modules.pdf_extraction.ocr_service import OcrBlock, set_ocr_engine
from src.modules.pdf_extraction.ocr_service.parser import (
    parse_paddle_result,
    polygon_to_bbox,
    text_layer_to_blocks,
)
from src.modules.pdf_extraction.schemas import Step3OcrInput, Step3PageSourceInput
from src.modules.pdf_extraction.steps.step3_ocr import run_step3_ocr


class MockOcrEngine:
    def recognize_image(self, image_bytes: bytes) -> list[OcrBlock]:
        assert image_bytes.startswith(b"\x89PNG")
        return [
            OcrBlock(text="Diagnosis: URI", bbox=[12.0, 34.0, 220.0, 58.0], confidence=0.93)
        ]


def test_polygon_to_bbox():
    bbox = polygon_to_bbox([[10, 20], [100, 20], [100, 50], [10, 50]])
    assert bbox == [10.0, 20.0, 100.0, 50.0]


def test_parse_paddle_v3_result_with_res_wrapper():
    raw = {
        "res": {
            "rec_texts": ["HEALTHFLOW HOSPITAL", "STATEMENT"],
            "rec_scores": [0.99, 0.97],
            "rec_polys": [[[0, 0], [10, 0], [10, 5], [0, 5]], [[0, 6], [12, 6], [12, 11], [0, 11]]],
        }
    }
    blocks = parse_paddle_result(raw)
    assert len(blocks) == 2
    assert blocks[0].text == "HEALTHFLOW HOSPITAL"
    assert blocks[0].confidence == 0.99


def test_parse_paddle_legacy_result():
    raw = [
        [
            [[[10, 20], [100, 20], [100, 50], [10, 50]], ("Patient Name", 0.98)],
            [[[10, 60], [120, 60], [120, 90], [10, 90]], ("Diagnosis", 0.91)],
        ]
    ]
    blocks = parse_paddle_result(raw)
    assert len(blocks) == 2
    assert blocks[0].text == "Patient Name"
    assert blocks[0].bbox == [10.0, 20.0, 100.0, 50.0]
    assert blocks[0].confidence == 0.98


def test_text_layer_to_blocks():
    blocks = text_layer_to_blocks("Patient: Chan\nDiagnosis: URI\n")
    assert len(blocks) == 2
    assert blocks[0].bbox is None
    assert blocks[0].confidence == 1.0


def test_run_step3_mixed_pages(tmp_path):
    png_path = tmp_path / "page1.png"
    png_path.write_bytes(
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
        b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x01\x01\x01\x00\x18\xdd\x8d\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )

    set_ocr_engine(MockOcrEngine())
    data = Step3OcrInput(
        task_id="EXTTESTOCR1",
        pages=[
            Step3PageSourceInput(
                page=1,
                source="text_layer",
                text="Patient Name: Chan Tai Man",
            ),
            Step3PageSourceInput(
                page=2,
                source="ocr_required",
                image_path=str(png_path),
            ),
        ],
    )

    output = run_step3_ocr(
        data,
        engine=MockOcrEngine(),
        download_image=lambda path: open(path, "rb").read(),
    )
    set_ocr_engine(None)

    assert output.status == "CLASSIFYING"
    assert output.page_count == 2
    assert output.ocr_page_count == 1
    assert output.text_layer_page_count == 1
    assert output.total_blocks == 2
    assert output.pages[0].blocks[0].text.startswith("Patient Name")
    assert output.pages[1].blocks[0].text == "Diagnosis: URI"
