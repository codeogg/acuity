"""运营端 Claims 监察：PHI 脱敏。"""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from src.core.exceptions import NotFoundException
from src.modules.claims import service as claims_service
from src.modules.claims.schemas import ClaimOut


class _ScalarResult:
    def __init__(self, value):
        self._value = value

    def scalars(self):
        return self

    def all(self):
        return self._value

    def scalar_one(self):
        if isinstance(self._value, list):
            return self._value[0] if self._value else None
        return self._value


@pytest.mark.asyncio
async def test_get_claim_oversight_redacts_phi(monkeypatch: pytest.MonkeyPatch) -> None:
    claim = SimpleNamespace(
        id=9,
        submission_no="SUBTEST001",
        clinic_id=1,
        doctor_id=2,
        company_id=3,
        template_id=4,
        template_version="1.0",
        patient_name="陳大文 / Chan",
        patient_name_cn="陳大文",
        patient_name_en="Chan",
        extraction_task_id=None,
        ai_raw_result={"patient_name_cn": {"value": "陳大文", "confidence": 0.9}},
        final_field_values={"patient_name_cn": "陳大文", "diagnosis": "flu"},
        field_confirmations=None,
        row_version=1,
        ai_token_usage=10,
        ai_process_time_ms=100,
        generated_pdf_url=None,
        status="AI_FILLED",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    db = MagicMock()
    db.get = AsyncMock(return_value=claim)
    monkeypatch.setattr(claims_service, "get_extraction_task_no", AsyncMock(return_value=None))

    out = await claims_service.get_claim_oversight(db, 9)
    assert isinstance(out, ClaimOut)
    assert out.patient_name is None
    assert out.patient_name_cn is None
    assert out.patient_name_en is None
    assert out.ai_raw_result is None
    assert out.final_field_values == {"patient_name_cn": "陳大文", "diagnosis": "flu"}
    assert out.submission_no == "SUBTEST001"


@pytest.mark.asyncio
async def test_get_claim_oversight_not_found() -> None:
    db = MagicMock()
    db.get = AsyncMock(return_value=None)
    with pytest.raises(NotFoundException):
        await claims_service.get_claim_oversight(db, 404)


@pytest.mark.asyncio
async def test_list_claims_oversight_nulls_patient_names() -> None:
    claim = SimpleNamespace(
        id=1,
        submission_no="SUB1",
        clinic_id=7,
        company_id=2,
        template_id=3,
        generated_pdf_url=None,
        status="DRAFT",
        created_at=datetime.now(UTC),
        patient_name="secret",
        patient_name_cn="密",
        patient_name_en="secret",
    )

    db = MagicMock()

    async def fake_execute(stmt):  # noqa: ANN001
        sql = str(stmt).lower()
        if "count" in sql:
            return _ScalarResult(1)
        result = MagicMock()
        result.all = MagicMock(
            return_value=[
                (claim, "AIA", "AIA EN", "Form A", "診所甲", "Clinic A"),
            ]
        )
        return result

    db.execute = AsyncMock(side_effect=fake_execute)

    items, total = await claims_service.list_claims_oversight(
        db,
        clinic_id=None,
        status=None,
        date_from=None,
        date_to=None,
        page=1,
        page_size=25,
    )
    assert total == 1
    assert len(items) == 1
    assert items[0].patient_name is None
    assert items[0].patient_name_cn is None
    assert items[0].patient_name_en is None
    assert items[0].clinic_id == 7
    assert items[0].company_name == "AIA"
