"""TOTP helpers (RFC 6238) + QR provisioning."""
from __future__ import annotations

import base64
import io
import re

import pyotp
import qrcode

from src.core.exceptions import ValidationException

TOTP_ISSUER = "Acuity"
TOTP_INTERVAL = 30
TOTP_VALID_WINDOW = 1  # ±1 step (30s)


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def build_provisioning_uri(*, secret: str, account_name: str) -> str:
    totp = pyotp.TOTP(secret, interval=TOTP_INTERVAL)
    return totp.provisioning_uri(name=account_name, issuer_name=TOTP_ISSUER)


def qr_code_base64(uri: str) -> str:
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def normalize_totp_code(code: str) -> str:
    digits = re.sub(r"\D", "", code.strip())
    if len(digits) != 6:
        raise ValidationException("验证码必须为 6 位数字")
    return digits


def verify_totp(*, secret: str, code: str) -> bool:
    normalized = normalize_totp_code(code)
    totp = pyotp.TOTP(secret, interval=TOTP_INTERVAL)
    return totp.verify(normalized, valid_window=TOTP_VALID_WINDOW)
