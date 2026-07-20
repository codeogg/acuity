"""PaddleOCR 结果解析（兼容 2.x / 3.x 常见输出结构）。"""
from __future__ import annotations

from typing import Any

from src.modules.pdf_extraction.ocr_service import OcrBlock


def polygon_to_bbox(polygon: list[list[float]]) -> list[float]:
    xs = [float(p[0]) for p in polygon]
    ys = [float(p[1]) for p in polygon]
    return [min(xs), min(ys), max(xs), max(ys)]


def _blocks_from_text_score_pairs(
    texts: list[str], scores: list[float], polygons: list[Any] | None
) -> list[OcrBlock]:
    blocks: list[OcrBlock] = []
    for idx, text in enumerate(texts):
        text = (text or "").strip()
        if not text:
            continue
        score = float(scores[idx]) if idx < len(scores) else 1.0
        bbox = None
        if polygons and idx < len(polygons) and polygons[idx]:
            poly = polygons[idx]
            if isinstance(poly, list) and poly and isinstance(poly[0], (list, tuple)):
                bbox = polygon_to_bbox(poly)  # type: ignore[arg-type]
        blocks.append(OcrBlock(text=text, bbox=bbox, confidence=round(score, 4)))
    return blocks


def _ocr_payload_from_dict(data: dict) -> dict | None:
    """将 PaddleOCR 3.x OCRResult.json 规范为含 rec_texts 的扁平结构。"""
    if "rec_texts" in data:
        return data
    res = data.get("res")
    if isinstance(res, dict) and "rec_texts" in res:
        return res
    return None


def parse_paddle_result(raw: Any) -> list[OcrBlock]:
    """将 PaddleOCR predict/ocr 返回值解析为统一 blocks。"""
    if raw is None:
        return []

    # PaddleOCR 3.x：单页结果对象（含 rec_texts / rec_scores / dt_polys）
    if hasattr(raw, "json"):
        data = raw.json
        if isinstance(data, dict):
            payload = _ocr_payload_from_dict(data)
            if payload is not None:
                return _blocks_from_text_score_pairs(
                    list(payload.get("rec_texts") or []),
                    [float(s) for s in (payload.get("rec_scores") or [])],
                    payload.get("dt_polys") or payload.get("rec_polys"),
                )

    if isinstance(raw, dict):
        payload = _ocr_payload_from_dict(raw)
        if payload is not None:
            return _blocks_from_text_score_pairs(
                list(payload.get("rec_texts") or []),
                [float(s) for s in (payload.get("rec_scores") or [])],
                payload.get("dt_polys") or payload.get("rec_polys"),
            )

    # PaddleOCR 2.x：[[[box, (text, score)], ...]]
    if isinstance(raw, list):
        if raw and isinstance(raw[0], list) and raw[0] and isinstance(raw[0][0], list):
            page = raw[0]
            blocks: list[OcrBlock] = []
            for line in page:
                if not line or len(line) < 2:
                    continue
                polygon, rec = line[0], line[1]
                text = rec[0] if isinstance(rec, (list, tuple)) else str(rec)
                score = float(rec[1]) if isinstance(rec, (list, tuple)) and len(rec) > 1 else 1.0
                text = str(text).strip()
                if not text:
                    continue
                bbox = polygon_to_bbox(polygon) if polygon else None
                blocks.append(OcrBlock(text=text, bbox=bbox, confidence=round(score, 4)))
            return blocks

        blocks = []
        for item in raw:
            blocks.extend(parse_paddle_result(item))
        return blocks

    return []


def text_layer_to_blocks(text: str) -> list[OcrBlock]:
    """将 Step2 文本层整理为与 OCR 相同的 blocks 结构。"""
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines and text.strip():
        lines = [text.strip()]
    return [OcrBlock(text=line, bbox=None, confidence=1.0) for line in lines]
