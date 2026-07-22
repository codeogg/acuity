from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SubscriptionStatus = Literal["trial", "active", "cancelled", "expired"]
PaymentStatus = Literal["unpaid", "paid", "overdue", "refunded"]
PaymentMethod = Literal["bank_transfer", "credit_card", "cheque", "other"]
NoteFormat = Literal["html", "markdown"]

SUBSCRIPTION_STATUSES = frozenset({"trial", "active", "cancelled", "expired"})
PAYMENT_STATUSES = frozenset({"unpaid", "paid", "overdue", "refunded"})
PAYMENT_METHODS = frozenset({"bank_transfer", "credit_card", "cheque", "other"})
NOTE_FORMATS = frozenset({"html", "markdown"})


class ClinicSubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    clinic_id: int
    subscription_status: str
    plan_code: str | None
    price: Decimal | None
    currency: str
    payment_status: str | None
    payment_method: str | None
    note_content: str | None
    note_format: str
    note_updated_by: int | None
    note_updated_at: datetime | None
    updated_at: datetime


class ClinicSubscriptionUpdate(BaseModel):
    subscription_status: SubscriptionStatus | None = None
    plan_code: str | None = Field(default=None, max_length=50)
    price: Decimal | None = None
    currency: str | None = Field(default=None, max_length=10)
    payment_status: PaymentStatus | None = None
    payment_method: PaymentMethod | None = None


class ClinicSubscriptionNoteUpdate(BaseModel):
    note_content: str | None = None
    note_format: NoteFormat | None = None
