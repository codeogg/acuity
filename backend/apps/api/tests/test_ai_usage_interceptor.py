import pytest

from src.core.ai_usage_context import (
    get_ai_call_context,
    reset_ai_call_context,
    set_ai_call_context,
)
from src.core.ai_usage_interceptor import capture_ai_usage, track_ai_usage


class EnabledClient:
    enabled = True

    @track_ai_usage
    async def successful_call(self):
        capture_ai_usage(
            model="gemini-2.5-flash",
            purpose="sdk_default",
            input_tokens=120,
            output_tokens=30,
        )
        return {"ok": True}

    @track_ai_usage
    async def failed_call(self, *, model: str):
        raise RuntimeError("provider unavailable")


@pytest.mark.asyncio
async def test_interceptor_records_tokens_and_business_context(monkeypatch):
    writes: list[dict] = []

    async def fake_write(**kwargs):
        context = get_ai_call_context()
        writes.append({**kwargs, "context": context})

    monkeypatch.setattr(
        "src.core.ai_usage_interceptor._write_usage_log", fake_write
    )
    token = set_ai_call_context(
        purpose="classify",
        clinic_id=11,
        doctor_id=22,
        submission_id=33,
    )
    try:
        result = await EnabledClient().successful_call()
    finally:
        reset_ai_call_context(token)

    assert result == {"ok": True}
    assert len(writes) == 1
    assert writes[0]["status"] == "success"
    assert writes[0]["captured"].input_tokens == 120
    assert writes[0]["captured"].output_tokens == 30
    assert writes[0]["context"].purpose == "classify"
    assert writes[0]["context"].clinic_id == 11
    assert writes[0]["context"].doctor_id == 22
    assert writes[0]["context"].submission_id == 33


@pytest.mark.asyncio
async def test_interceptor_records_failed_call_with_zero_usage(monkeypatch):
    writes: list[dict] = []

    async def fake_write(**kwargs):
        writes.append(kwargs)

    monkeypatch.setattr(
        "src.core.ai_usage_interceptor._write_usage_log", fake_write
    )
    with pytest.raises(RuntimeError, match="provider unavailable"):
        await EnabledClient().failed_call(model="gemini-3.1-pro-preview")

    assert len(writes) == 1
    assert writes[0]["status"] == "failed"
    assert writes[0]["captured"] is None
    assert writes[0]["fallback_model"] == "gemini-3.1-pro-preview"
    assert writes[0]["error_message"] == "provider unavailable"
