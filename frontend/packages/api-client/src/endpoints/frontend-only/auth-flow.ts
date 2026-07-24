// frontend-only: pending backend
//
// The folded-auth journey beyond the demo backend's login/me/logout: MFA
// challenge + verify (TOTP / backup code), account discovery (which clinics an
// identity can enter) + clinic selection, deliberate recovery, session state +
// refresh, and the session-expiry re-auth deep-link seam (single-use token +
// return-target allowlist). This is the WorkOS + MFA spec target staged as
// typed mock contract; the AuthAdapter seam stays the swap point. Types come
// from the canonical contract (packages/types/openapi.json).

import type {
  AuthClinicList,
  ClinicSelectRequest,
  ClinicSelectResponse,
  DeepLinkRedeemRequest,
  DeepLinkRedeemResponse,
  DeepLinkToken,
  DeepLinkTokenRequest,
  LoginResponse,
  MeResponse,
  MfaChallenge,
  MfaVerifyRequest,
  RecoveryStartRequest,
  SessionState,
  SuccessResponse,
} from "@acuity/types";
import { api } from "../../client";

export type {
  AuthClinicList,
  ClinicSelectRequest,
  ClinicSelectResponse,
  DeepLinkRedeemRequest,
  DeepLinkRedeemResponse,
  DeepLinkToken,
  DeepLinkTokenRequest,
  MfaChallenge,
  MfaVerifyRequest,
  RecoveryStartRequest,
  SessionState,
};
export type AuthClinicOption = AuthClinicList["items"][number];
export type MfaMethod = MfaChallenge["methods"][number];

// The account-model session markers (ADR 0040 MFA opt-in, ADR 0041 §6 merged
// workspace) are folded into the canonical LoginResponse/MeResponse as
// optional declared backend asks; aliases kept for existing imports.
export type AccountSessionExtension = Pick<LoginResponse, "mfa_enabled" | "merged_workspace">;
export type LoginResponseExtended = LoginResponse & {
  mfa_enrollment_required?: boolean;
  backup_codes?: string[] | null;
};
export type MeResponseExtended = MeResponse & {
  impersonation?: {
    session_id: number;
    operator_id: number;
    doctor_id: number;
    clinic_id: number;
    mode: "view" | "proxy";
    operator?: string | null;
    doctor?: string | null;
  } | null;
};

export interface MfaEnrollInitResult {
  qr_code_base64: string;
  provisioning_uri: string;
  secret: string;
}

// --- MFA -----------------------------------------------------------------------

export function beginMfaChallenge(): Promise<MfaChallenge> {
  return api.post<MfaChallenge>("/auth/mfa/challenge");
}

export function verifyMfa(body: MfaVerifyRequest & { mfa_token?: string | null }): Promise<LoginResponse> {
  return api.post<LoginResponse>("/auth/mfa/verify", body);
}

export function verifyMfaBackupCode(body: {
  code: string;
  mfa_token?: string | null;
}): Promise<LoginResponse> {
  return api.post<LoginResponse>("/auth/mfa/verify-backup-code", body);
}

export function beginMfaEnroll(body: { mfa_token?: string | null }): Promise<MfaEnrollInitResult> {
  return api.post<MfaEnrollInitResult>("/auth/mfa/enroll/init", body);
}

export function confirmMfaEnroll(body: {
  code: string;
  mfa_token?: string | null;
}): Promise<LoginResponseExtended> {
  return api.post<LoginResponseExtended>("/auth/mfa/enroll/confirm", body);
}

// --- recovery --------------------------------------------------------------------

export function startRecovery(body: RecoveryStartRequest = {}): Promise<SuccessResponse> {
  return api.post<SuccessResponse>("/auth/recovery/start", body);
}

// --- account discovery + clinic selection ---------------------------------------

export function listAccountClinics(): Promise<AuthClinicList> {
  return api.get<AuthClinicList>("/auth/clinics");
}

export function selectClinic(body: ClinicSelectRequest): Promise<ClinicSelectResponse> {
  return api.post<ClinicSelectResponse>("/auth/clinics/select", body);
}

// --- session state + refresh ------------------------------------------------------

export function getSession(): Promise<SessionState> {
  return api.get<SessionState>("/auth/session");
}

export function refreshSession(): Promise<SessionState> {
  return api.post<SessionState>("/auth/session/refresh");
}

// --- session-expiry re-auth deep link ----------------------------------------------

// Issue a single-use token preserving the deep link through re-auth. The
// return target must be on the allowlist (422 otherwise).
export function issueDeepLinkToken(body: DeepLinkTokenRequest): Promise<DeepLinkToken> {
  return api.post<DeepLinkToken>("/auth/session/deep-link", body);
}

// Redeem is single-use: a second redeem of the same token returns valid: false.
export function redeemDeepLinkToken(
  body: DeepLinkRedeemRequest,
): Promise<DeepLinkRedeemResponse> {
  return api.post<DeepLinkRedeemResponse>("/auth/session/deep-link/redeem", body);
}
