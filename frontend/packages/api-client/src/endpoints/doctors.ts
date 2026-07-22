// Admin doctors — CRUD + paging + status toggle + password reset, following the
// clinics pattern. All routes under /api/admin/doctors.

import type {
  DoctorCreate,
  DoctorOut,
  DoctorStatusUpdate,
  DoctorUpdate,
  Page,
  ResetPasswordResponse,
} from "@acuity/types";
import { api } from "../client";

// A type alias (not interface) so it is assignable to the client's query index
// signature.
export type ListDoctorsQuery = {
  page?: number;
  page_size?: number;
  clinic_id?: number;
  keyword?: string;
  /** Filter by clinic-linked vs individual accounts (ADR 0041). */
  linked?: "clinic" | "individual";
};

export function listDoctors(query: ListDoctorsQuery = {}): Promise<Page<DoctorOut>> {
  return api.get<Page<DoctorOut>>("/admin/doctors", { query });
}

export function getDoctor(doctorId: number): Promise<DoctorOut> {
  return api.get<DoctorOut>(`/admin/doctors/${doctorId}`);
}

export function createDoctor(body: DoctorCreate): Promise<DoctorOut> {
  return api.post<DoctorOut>("/admin/doctors", body);
}

export function updateDoctor(doctorId: number, body: DoctorUpdate): Promise<DoctorOut> {
  return api.put<DoctorOut>(`/admin/doctors/${doctorId}`, body);
}

export function setDoctorStatus(
  doctorId: number,
  body: DoctorStatusUpdate,
): Promise<DoctorOut> {
  return api.patch<DoctorOut>(`/admin/doctors/${doctorId}/status`, body);
}

// 204 No Content on success.
export function deleteDoctor(doctorId: number): Promise<void> {
  return api.delete<void>(`/admin/doctors/${doctorId}`);
}

export function resetDoctorPassword(doctorId: number): Promise<ResetPasswordResponse> {
  return api.post<ResetPasswordResponse>(`/admin/doctors/${doctorId}/reset-password`);
}

export type DoctorNotesUpdate = {
  notes?: string;
  notes_format?: "markdown" | "html";
};

export function updateDoctorNotes(
  doctorId: number,
  body: DoctorNotesUpdate,
): Promise<DoctorOut> {
  return api.put<DoctorOut>(`/admin/doctors/${doctorId}/account-notes`, body);
}
