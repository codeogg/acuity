// frontend-only: pending backend
//
// Staff hand-off — a clinic staff member prepares a claim (patient details +
// record entered) and hands it to the doctor for review + sign-off. The review
// surface shows a hand-off banner; work-home counts pending hand-offs.

import type { HandoffCreate, HandoffStatus, StaffHandoff } from "@acuity/types";
import { api } from "../../client";

export type { HandoffCreate, HandoffStatus, StaffHandoff };

export function listHandoffs(): Promise<StaffHandoff[]> {
  return api.get<StaffHandoff[]>("/doctor/handoffs");
}

// Staff-side: attach a hand-off note to a prepared claim.
export function createHandoff(claimId: number, body: HandoffCreate): Promise<StaffHandoff> {
  return api.post<StaffHandoff>(`/doctor/claims/${claimId}/handoff`, body);
}

// Doctor-side: acknowledge the hand-off (clears the pending banner/count).
export function acceptHandoff(handoffId: string): Promise<StaffHandoff> {
  return api.post<StaffHandoff>(`/doctor/handoffs/${handoffId}/accept`);
}
