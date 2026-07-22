"""MFA TOTP verification smoke tests."""
import pyotp

from src.core.mfa_totp import generate_totp_secret, verify_totp


def test_totp_verify_current_window() -> None:
    secret = generate_totp_secret()
    code = pyotp.TOTP(secret).now()
    assert verify_totp(secret=secret, code=code)


def test_totp_rejects_wrong_code() -> None:
    secret = generate_totp_secret()
    assert not verify_totp(secret=secret, code="000000")
