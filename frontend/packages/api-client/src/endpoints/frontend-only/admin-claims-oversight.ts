// frontend-only: pending backend
//
// Admin-scoped claims oversight. The console currently rides the doctor-scoped
// /api/doctor/claims/* routes, which an admin-role token cannot call (RBAC is
// admin-vs-doctor) — a seam that breaks at integration. These are the
// admin-scoped equivalents the backend needs: cross-clinic list + detail with
// PHI redacted (patient_name null, final_field_values withheld at portfolio
// level pending the redaction-rule decision).

import type { ClaimListItem, ClaimOut, ClaimStatus, Page } from "@acuity/types";
import { api } from "../../client";

// A type alias (not interface) so it is assignable to the client's query index
// signature.
export type ListClaimsOversightQuery = {
  page?: number;
  page_size?: number;
  clinic_id?: number;
  status?: ClaimStatus;
  date_from?: string;
  date_to?: string;
};

export function listClaimsOversight(
  query: ListClaimsOversightQuery = {},
): Promise<Page<ClaimListItem>> {
  return api.get<Page<ClaimListItem>>("/admin/claims", { query });
}

export function getClaimOversight(claimId: number): Promise<ClaimOut> {
  return api.get<ClaimOut>(`/admin/claims/${claimId}`);
}
