"""运营工单 DTO 映射。"""

from datetime import UTC, datetime
from types import SimpleNamespace

from src.modules.tickets.service import _to_ticket_out


def test_to_ticket_out_maps_ticket_no_as_id() -> None:
    ticket = SimpleNamespace(
        id=1,
        ticket_no="TK-1101",
        clinic_id=42,
        subject_zh="测试",
        subject_en="Test",
        status="open",
        owner="M. Cheng",
        updated_at=datetime.now(UTC),
        notes=[SimpleNamespace(body="hello"), SimpleNamespace(body="world")],
    )
    out = _to_ticket_out(ticket)
    assert out.id == "TK-1101"
    assert out.clinic_id == 42
    assert out.owner == "M. Cheng"
    assert out.notes == ["hello", "world"]
    assert out.status == "open"
