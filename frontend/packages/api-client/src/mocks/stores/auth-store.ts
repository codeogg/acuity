// In-memory session state for the mock auth journey: credentials -> MFA ->
// (multi-clinic) clinic selection -> landed session, plus recovery, session
// expiry / refresh, and the single-use deep-link token seam. Deterministic
// demo accounts + codes come from the fixture universe (see the package README
// for the roster).

import type { DoctorOut } from "@acuity/types";
import type { WorkspaceSeparation } from "../../endpoints/frontend-only/account-management";
import {
  authAccounts,
  backupCode,
  demoClinics,
  returnTargetAllowlist,
  sessionClinicId,
  totpValidCode,
  type MockAuthAccount,
} from "../fixtures/universe";
import { adminState } from "./admin-store";

export interface MockSession {
  account: MockAuthAccount;
  mfaVerified: boolean;
  clinicId: number | null;
  // ADR 0041 account model, resolved live from the admin store at sign-in.
  clinicIds: number[];
  workspaceSeparation: WorkspaceSeparation;
  mfaEnabled: boolean;
  expiresAt: string;
  expired: boolean;
}

// ADR 0041: clinic links, the workspace-separation toggle, and the MFA opt-in
// are live console state — resolved from the admin doctors store at sign-in so
// operator edits (link/unlink, separation, MFA) apply on the doctor's next
// session. Non-doctor accounts (no doctor record) keep the fixture roster.
function accountModelFor(account: MockAuthAccount): {
  clinicIds: number[];
  separation: WorkspaceSeparation;
  mfaEnabled: boolean;
} {
  const doctor = adminState().doctors.find((d) => d.id === account.user_id) as
    | (DoctorOut & {
        clinic_ids?: number[];
        workspace_separation?: WorkspaceSeparation;
        mfa_enabled?: boolean;
      })
    | undefined;
  if (!doctor) {
    return {
      clinicIds: [...account.clinic_ids],
      separation: "separated",
      mfaEnabled: false,
    };
  }
  const clinicIds = Array.isArray(doctor.clinic_ids)
    ? [...doctor.clinic_ids]
    : doctor.clinic_id
      ? [doctor.clinic_id]
      : [];
  return {
    clinicIds,
    separation: doctor.workspace_separation ?? "separated",
    mfaEnabled: doctor.mfa_enabled === true,
  };
}

interface DeepLinkEntry {
  returnTarget: string;
  used: boolean;
}

let session: MockSession | null = defaultSession();
let challengeCounter = 1;
let activeChallengeId: string | null = null;
const deepLinks = new Map<string, DeepLinkEntry>();
let tokenCounter = 1;

// The mock boots signed-in as the session doctor so the doctor/admin surfaces
// work without walking the auth journey; the auth surface drives the journey
// explicitly (logout -> login -> MFA -> clinic select).
function defaultSession(): MockSession {
  const account = authAccounts.find((a) => a.login_account === "dr2207");
  if (!account) return null as never;
  const model = accountModelFor(account);
  return {
    account,
    mfaVerified: true,
    clinicId: sessionClinicId,
    clinicIds: model.clinicIds,
    workspaceSeparation: model.separation,
    mfaEnabled: model.mfaEnabled,
    expiresAt: futureIso(8 * 60),
    expired: false,
  };
}

function futureIso(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export type LoginOutcome =
  | { ok: true; session: MockSession }
  | { ok: false; reason: "invalid-credentials" | "locked" };

export function login(username: string, password: string): LoginOutcome {
  const account = authAccounts.find((a) => a.login_account === username);
  if (!account || account.password !== password) {
    return { ok: false, reason: "invalid-credentials" };
  }
  if (account.locked) return { ok: false, reason: "locked" };
  const model = accountModelFor(account);
  session = {
    account,
    mfaVerified: false,
    // Single-clinic identities are scoped immediately; a separated multi-clinic
    // session picks per journey step; a merged one never selects (ADR 0041 §6).
    clinicId: model.clinicIds.length === 1 ? (model.clinicIds[0] ?? null) : null,
    clinicIds: model.clinicIds,
    workspaceSeparation: model.separation,
    mfaEnabled: model.mfaEnabled,
    expiresAt: futureIso(8 * 60),
    expired: false,
  };
  return { ok: true, session };
}

export function logout(): void {
  session = null;
  activeChallengeId = null;
}

export function currentSession(): MockSession | null {
  return session;
}

export function beginChallenge(): { challengeId: string; methods: string[] } {
  activeChallengeId = `mfa-${challengeCounter++}`;
  const method = session?.account.mfa_method ?? "totp";
  return {
    challengeId: activeChallengeId,
    methods: method === "hardware-key" ? ["hardware-key"] : ["totp", "backup-code"],
  };
}

export type MfaOutcome = "ok" | "invalid-code" | "no-session";

export function verifyMfa(code: string): MfaOutcome {
  if (!session) return "no-session";
  const method = session.account.mfa_method;
  const valid =
    method === "hardware-key" ||
    code === totpValidCode ||
    code.toUpperCase() === backupCode;
  if (!valid) return "invalid-code";
  session.mfaVerified = true;
  return "ok";
}

export function accountClinics(): { id: number; clinic_code: string; name_zh: string; name_en: string }[] {
  if (!session) return [];
  return session.clinicIds
    .map((id) => demoClinics.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      id: c.id,
      clinic_code: c.clinic_code,
      name_zh: c.clinic_name,
      name_en: c.clinic_name_en ?? c.clinic_name,
    }));
}

export function currentWorkspaceSeparation(): WorkspaceSeparation {
  return session?.workspaceSeparation ?? "separated";
}

// ADR 0041 §6: the merged marker — a multi-clinic session whose account-level
// separation is "merged" carries no single selected clinic.
export function isMergedWorkspace(s: MockSession | null = session): boolean {
  return Boolean(s && s.workspaceSeparation === "merged" && s.clinicIds.length > 1);
}

// The session's tenant scope: every linked clinic when merged, else the
// selected clinic. Empty while a separated multi-clinic session is still
// pre-selection (merging is presentation — each clinic keeps its own scope
// underneath, mirroring the per-clinic RLS model).
export function sessionClinicScope(): number[] {
  if (!session) return [];
  if (isMergedWorkspace(session)) return [...session.clinicIds];
  return session.clinicId != null ? [session.clinicId] : [];
}

export function selectClinic(clinicId: number): boolean {
  if (!session || !session.clinicIds.includes(clinicId)) return false;
  session.clinicId = clinicId;
  return true;
}

export function expireSession(): void {
  if (session) session.expired = true;
}

export function refreshSession(): MockSession | null {
  if (!session) return null;
  session.expired = false;
  session.expiresAt = futureIso(8 * 60);
  return session;
}

// --- deep-link tokens (single-use, allowlisted return targets) -----------------

export function isAllowedReturnTarget(target: string): boolean {
  return returnTargetAllowlist.some(
    (prefix) => target === prefix || target.startsWith(prefix === "/" ? "/" : `${prefix}/`) || target.startsWith(`${prefix}?`),
  );
}

export function issueDeepLink(returnTarget: string): { token: string; expiresAt: string } {
  const token = `dl-${tokenCounter++}-${Math.abs(hash(returnTarget)).toString(16)}`;
  deepLinks.set(token, { returnTarget, used: false });
  return { token, expiresAt: futureIso(10) };
}

export function redeemDeepLink(token: string): string | null {
  const entry = deepLinks.get(token);
  if (!entry || entry.used) return null;
  entry.used = true;
  return entry.returnTarget;
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + (ch.codePointAt(0) ?? 0)) | 0;
  return h;
}

// Test/dev helper.
export function resetAuthStore(): void {
  session = defaultSession();
  activeChallengeId = null;
  deepLinks.clear();
}
