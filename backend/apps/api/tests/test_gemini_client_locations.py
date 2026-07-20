"""Gemini 多区域客户端配置单测。"""
from types import SimpleNamespace

from google.genai import types

from src.config import get_settings
from src.modules.ai_extraction.gemini_client import (
    get_gemini_client,
    reset_gemini_clients,
    resolve_thinking_level,
)
from src.modules.ai_extraction.gemini_usage import parse_usage_metadata


def test_gemini_step_locations_from_env(monkeypatch):
    monkeypatch.setenv("GCP_LOCATION", "europe-west2")
    monkeypatch.setenv("GEMINI_CLASSIFIER_LOCATION", "europe-west2")
    monkeypatch.setenv("GEMINI_EXTRACTOR_LOCATION", "global")
    get_settings.cache_clear()
    reset_gemini_clients()

    settings = get_settings()
    assert settings.gemini_classifier_location == "europe-west2"
    assert settings.gemini_extractor_location == "global"

    classifier_client = get_gemini_client(settings.gemini_classifier_location)
    extractor_client = get_gemini_client(settings.gemini_extractor_location)
    assert classifier_client.location == "europe-west2"
    assert extractor_client.location == "global"
    assert classifier_client is not extractor_client

    get_settings.cache_clear()
    reset_gemini_clients()


def test_resolve_thinking_level_defaults_to_low():
    assert resolve_thinking_level("low") == types.ThinkingLevel.LOW
    assert resolve_thinking_level("HIGH") == types.ThinkingLevel.HIGH
    assert resolve_thinking_level("invalid") == types.ThinkingLevel.LOW
    assert resolve_thinking_level(None) is None


def test_gemini_extractor_thinking_level_default(monkeypatch):
    monkeypatch.delenv("GEMINI_EXTRACTOR_THINKING_LEVEL", raising=False)
    get_settings.cache_clear()
    settings = get_settings()
    assert settings.GEMINI_EXTRACTOR_THINKING_LEVEL == "low"
    get_settings.cache_clear()


def test_parse_usage_metadata_extracts_token_fields():
    usage = parse_usage_metadata(
        SimpleNamespace(
            prompt_token_count=1200,
            cached_content_token_count=100,
            candidates_token_count=280,
            response_token_count=0,
            thoughts_token_count=450,
            tool_use_prompt_token_count=0,
            total_token_count=2030,
        )
    )
    assert usage["prompt_token_count"] == 1200
    assert usage["candidates_token_count"] == 280
    assert usage["output_token_count"] == 280
    assert usage["response_token_count"] == 0
    assert usage["thoughts_token_count"] == 450
    assert usage["total_token_count"] == 2030


def test_parse_usage_metadata_falls_back_to_response_token_count():
    usage = parse_usage_metadata(
        SimpleNamespace(
            prompt_token_count=100,
            candidates_token_count=0,
            response_token_count=42,
            total_token_count=142,
        )
    )
    assert usage["output_token_count"] == 42
