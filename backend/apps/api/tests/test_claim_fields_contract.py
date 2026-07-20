"""Regression coverage for the Step 4 doctor field-save contract."""
import secrets

import pytest
from sqlalchemy import select

from src.core.exceptions import ConflictException
from src.db.models import ClaimSubmission, InsuranceCompany, PolicyTemplate
from src.modules.claims import service


@pytest.mark.asyncio
async def test_fields_save_persists_confirmation_and_rejects_stale_version(
    db_session, demo_clinic_doctor
):
    clinic, doctor = demo_clinic_doctor
    company = (await db_session.execute(select(InsuranceCompany))).scalars().first()
    assert company is not None
    template = PolicyTemplate(
        company_id=company.id,
        template_name="Contract test template",
        template_code=f"CONTRACT-{secrets.token_hex(6)}",
        original_pdf_url="test://contract-template.pdf",
    )
    db_session.add(template)
    await db_session.flush()

    claim = ClaimSubmission(
        submission_no=f"CONTRACT-{secrets.token_hex(6)}",
        clinic_id=clinic.id,
        doctor_id=doctor.id,
        company_id=company.id,
        template_id=template.id,
        status="DRAFT",
    )
    db_session.add(claim)
    await db_session.flush()

    updated = await service.update_fields(
        db_session,
        claim_id=claim.id,
        clinic_id=clinic.id,
        values={"patient_name": "Contract patient"},
        confirmed={"patient_name": True},
        row_version=1,
    )
    assert updated.final_field_values == {"patient_name": "Contract patient"}
    assert updated.field_confirmations == {"patient_name": True}
    assert updated.row_version == 2

    with pytest.raises(ConflictException):
        await service.update_fields(
            db_session,
            claim_id=claim.id,
            clinic_id=clinic.id,
            values={"patient_name": "Stale write"},
            row_version=1,
        )
