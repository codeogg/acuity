#!/usr/bin/env python3
"""单独测试 Vertex AI Gemini 连通性（Step4 / Step7 配置）。"""
from __future__ import annotations

import asyncio
import json
import sys

from src.config import settings
from src.modules.ai_extraction.gemini_client import get_gemini_client
from src.modules.ai_extraction.gemini_usage import parse_usage_metadata


async def ping(location: str, model: str, label: str) -> dict:
    client = get_gemini_client(location)
    result = {
        "label": label,
        "location": location,
        "model": model,
        "enabled": client.enabled,
        "ok": False,
        "error": None,
        "reply": None,
        "token_usage": 0,
    }
    if not client.enabled:
        result["error"] = "GCP_PROJECT_ID 未配置或客户端初始化失败（stub 模式）"
        return result

    try:
        from google.genai import types

        response = await asyncio.wait_for(
            client._client.aio.models.generate_content(
                model=model,
                contents='回复 JSON：{"ping":"pong"}',
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.0,
                ),
            ),
            timeout=30.0,
        )
        result["ok"] = True
        result["reply"] = str(response.text or response.parsed)[:200]
        usage = parse_usage_metadata(response.usage_metadata)
        result["token_usage"] = usage["total_token_count"]
        result["token_usage_detail"] = usage
    except Exception as exc:
        result["error"] = str(exc)
    return result


async def main() -> int:
    print("=== Gemini 连通性测试 ===")
    print(f"GCP_PROJECT_ID={settings.GCP_PROJECT_ID}")
    print(f"GOOGLE_APPLICATION_CREDENTIALS={settings.GOOGLE_APPLICATION_CREDENTIALS or '(ADC)'}")
    print()

    cases = [
        (
            "Step4 文档分类",
            settings.gemini_classifier_location,
            settings.GEMINI_CLASSIFIER_MODEL,
        ),
        (
            "Step7 字段提取",
            settings.gemini_extractor_location,
            settings.GEMINI_EXTRACTOR_MODEL,
        ),
    ]

    all_ok = True
    for label, location, model in cases:
        print(f"--- {label} ---")
        r = await ping(location, model, label)
        print(json.dumps(r, ensure_ascii=False, indent=2))
        if not r["ok"]:
            all_ok = False
        print()

    return 0 if all_ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
