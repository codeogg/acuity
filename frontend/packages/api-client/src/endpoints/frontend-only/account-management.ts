// frontend-only: pending backend
//
// Account–clinic management extensions (dev ADR 0041): doctor accounts link to
// zero/one/many clinics (individual subscriptions supported), lifecycle is
// non-destructive, operators keep markdown notes on clinics and doctors, and
// login-issue tooling (reset MFA, unlock) lives per account. Types come from
// the canonical contract (packages/types/openapi.json); the ops are surfaced
// to the backend team via x-backend-status + the endpoint checklist.

import type {
  ClinicAccountOut,
  DoctorAccountModelUpdate,
  DoctorAccountOut,
  WorkspaceSeparation,
} from "@acuity/types";
import { api } from "../../client";

export type { ClinicAccountOut, DoctorAccountModelUpdate, DoctorAccountOut, WorkspaceSeparation };

// Extension views over the contract entities (aliases kept for existing imports).
export type DoctorAccountExtension = Pick<
  DoctorAccountOut,
  "clinic_ids" | "notes" | "workspace_separation" | "mfa_enabled"
>;
export type ClinicNotesExtension = Pick<ClinicAccountOut, "notes">;

export function linkDoctorClinic(
  doctorId: number,
  clinicId: number,
): Promise<DoctorAccountOut> {
  return api.post<DoctorAccountOut>(`/admin/doctors/${doctorId}/clinics`, {
    clinic_id: clinicId,
  });
}

/** Replace the doctor's linked-clinic set atomically (covers switch without a
    bespoke verb; mirrors the clinic insurance-companies set-collection op). */
export function setDoctorClinics(
  doctorId: number,
  clinicIds: number[],
): Promise<DoctorAccountOut> {
  return api.put<DoctorAccountOut>(`/admin/doctors/${doctorId}/clinics`, {
    clinic_ids: clinicIds,
  });
}

export function unlinkDoctorClinic(
  doctorId: number,
  clinicId: number,
): Promise<DoctorAccountOut> {
  return api.delete<DoctorAccountOut>(
    `/admin/doctors/${doctorId}/clinics/${clinicId}`,
  );
}

/** Account-model fields not in the contract update body (notes, separation,
    MFA opt-in). Linking changes go through link/unlink/set, never this patch. */
export function updateDoctorAccountModel(
  doctorId: number,
  body: DoctorAccountModelUpdate,
): Promise<DoctorAccountOut> {
  return api.patch<DoctorAccountOut>(
    `/admin/doctors/${doctorId}/account-model`,
    body,
  );
}

/** Login-issue tooling: clear the account's MFA enrolment so the doctor
    re-enrols on next sign-in. */
export function resetDoctorMfa(doctorId: number): Promise<DoctorAccountOut> {
  return api.post<DoctorAccountOut>(`/admin/doctors/${doctorId}/reset-mfa`);
}

/** Login-issue tooling: clear a rate-limit / failed-attempt lock. */
export function unlockDoctorAccount(doctorId: number): Promise<DoctorAccountOut> {
  return api.post<DoctorAccountOut>(`/admin/doctors/${doctorId}/unlock`);
}

export function updateClinicNotes(
  clinicId: number,
  notes: string,
): Promise<ClinicAccountOut> {
  return api.patch<ClinicAccountOut>(`/admin/clinics/${clinicId}/notes`, {
    notes,
  });
}
