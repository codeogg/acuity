// In-memory, module-scoped claim store — the stateful heart of the doctor-loop
// mock. Lives for the lifetime of the runtime (browser tab or Node process) so
// the full DRAFT -> AI_FILLED -> CONFIRMED -> PRINTED loop is stateful across
// navigations. Seeds from the shared fixture universe (ALL clinics, so the
// operator console sees the same dataset) and scopes doctor-surface reads to
// the session clinic (tenant isolation: cross-clinic access is not-found).
// Drives the 409 optimistic-lock demonstration via a monotonically-increasing
// per-claim rowVersion.

import type { ClaimOut } from "@acuity/types";
import { intakeRecords, seedClaims } from "../fixtures/universe";

export interface ClaimStoreEntry {
  claim: ClaimOut;
  // Per-field confirmation set (the doctor's checkmarks). field_code -> confirmed.
  confirmed: Record<string, boolean>;
  // Optimistic-lock version, bumped on every server-side field mutation.
  rowVersion: number;
  // The intake source text ("your notes").
  intakeText: string | null;
  // Uploaded medical-record PDF (mock) + extraction task id for the review pane.
  medicalPdfBytes?: Uint8Array | null;
  extractionTaskNo?: string | null;
}

let store: Map<number, ClaimStoreEntry> | null = null;
let nextId = 6000;

function seedConfirmed(claim: ClaimOut): Record<string, boolean> {
  // A PRINTED / CONFIRMED claim has all its populated fields confirmed; an
  // AI_FILLED claim arrives with everything drafted (unconfirmed); a DRAFT has
  // nothing yet.
  const confirmed: Record<string, boolean> = {};
  if (claim.status === "PRINTED" || claim.status === "CONFIRMED") {
    for (const code of Object.keys(claim.final_field_values ?? {})) {
      confirmed[code] = true;
    }
  }
  return confirmed;
}

function ensure(): Map<number, ClaimStoreEntry> {
  if (!store) {
    store = new Map();
    for (const claim of seedClaims()) {
      store.set(claim.id, {
        claim,
        confirmed: seedConfirmed(claim),
        rowVersion: 1,
        intakeText: intakeRecords[String(claim.id)] ?? null,
      });
    }
  }
  return store;
}

export function getClaimEntry(id: number): ClaimStoreEntry | undefined {
  return ensure().get(id);
}

// Tenant-scoped read: a claim outside the session's clinic scope is not-found
// (404, never 403). The scope is one clinic for a selected session, several
// for a merged workspace (ADR 0041 §6) — each clinic keeps its own scope;
// merging only widens which scopes the session may read.
export function getClaimEntryScoped(
  id: number,
  clinicIds: number[],
): ClaimStoreEntry | undefined {
  const entry = ensure().get(id);
  if (!entry || !clinicIds.includes(entry.claim.clinic_id)) return undefined;
  return entry;
}

export function listClaimEntries(scope?: {
  clinicIds?: number[];
  doctorId?: number;
}): ClaimStoreEntry[] {
  let entries = Array.from(ensure().values());
  if (scope?.clinicIds !== undefined) {
    const ids = scope.clinicIds;
    entries = entries.filter((e) => ids.includes(e.claim.clinic_id));
  }
  if (scope?.doctorId !== undefined) {
    entries = entries.filter((e) => e.claim.doctor_id === scope.doctorId);
  }
  return entries.sort((a, b) => b.claim.created_at.localeCompare(a.claim.created_at));
}

export function createClaimEntry(
  companyId: number,
  templateId: number,
  owner: { clinicId: number; doctorId: number; templateVersion?: string },
): ClaimStoreEntry {
  const id = nextId++;
  const now = new Date().toISOString();
  const claim: ClaimOut = {
    id,
    submission_no: `SUB${now.slice(0, 10).replace(/-/g, "")}${id.toString(16).toUpperCase()}`,
    clinic_id: owner.clinicId,
    doctor_id: owner.doctorId,
    company_id: companyId,
    template_id: templateId,
    template_version: owner.templateVersion ?? "V1",
    patient_name: null,
    patient_name_cn: null,
    patient_name_en: null,
    ai_raw_result: null,
    final_field_values: null,
    ai_token_usage: null,
    ai_process_time_ms: null,
    generated_pdf_url: null,
    status: "DRAFT",
    created_at: now,
  };
  const entry: ClaimStoreEntry = { claim, confirmed: {}, rowVersion: 1, intakeText: null };
  ensure().set(id, entry);
  return entry;
}

export function updateClaimEntry(
  id: number,
  mutate: (entry: ClaimStoreEntry) => void,
): ClaimStoreEntry | undefined {
  const entry = getClaimEntry(id);
  if (!entry) return undefined;
  mutate(entry);
  entry.rowVersion += 1;
  return entry;
}

export function deleteClaimEntry(id: number): boolean {
  return ensure().delete(id);
}

// Test/dev helper: drop all state and reseed from the fixture universe.
export function resetClaimsStore(): void {
  store = null;
  nextId = 6000;
}
