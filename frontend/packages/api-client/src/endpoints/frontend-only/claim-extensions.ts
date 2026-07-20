// frontend-only: pending backend
//
// Claim-scoped extensions the doctor surfaces need beyond the demo contract:
//   - GET  /doctor/claims/{id}/intake-text — the intake source text (the "your
//     notes" evidence pane) + the per-field confirmation set + the optimistic-
//     lock cursor. The real backend serves source evidence on demand (PHI
//     fetched minimally).
//   - DELETE /doctor/claims/{id} — history permanent-delete (the demo backend
//     only has admin-scoped deletes).
//   - The fields-save body extensions (per-field `confirmed` set + claim-level
//     `row_version` cursor) and the ClaimListItem clinic attribution are folded
//     into the canonical contract schemas as optional declared backend asks.
//     Per-field confirmation state has no backend home yet; this is the most
//     load-bearing gap to raise with the backend team.

import type { ClaimIntakeText, ClaimListItem, FieldsUpdate } from "@acuity/types";
import { api } from "../../client";

export type { ClaimIntakeText };

// Clinic attribution over the contract ClaimListItem (dev ADR 0041): now part
// of the canonical schema; aliases kept for existing imports.
export type ClaimListItemClinic = Pick<ClaimListItem, "clinic_id" | "clinic_name">;
export type ClaimListItemWithClinic = ClaimListItem;

// Fields-save body extensions (`confirmed`, `row_version`): now part of the
// canonical FieldsUpdate schema; alias kept for existing imports.
export type FieldsUpdateExtended = FieldsUpdate;

export function getClaimIntakeText(claimId: number): Promise<ClaimIntakeText> {
  return api.get<ClaimIntakeText>(`/doctor/claims/${claimId}/intake-text`);
}

// 204 No Content on success.
export function deleteClaim(claimId: number): Promise<void> {
  return api.delete<void>(`/doctor/claims/${claimId}`);
}
