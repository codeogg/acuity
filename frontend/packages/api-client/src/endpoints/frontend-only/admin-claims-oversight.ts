// Admin claims oversight — live FastAPI /api/admin/claims* (PHI-redacted).
// MSW handlers in mocks/handlers/admin.ts still cover mock-first mode.

import type { ClaimListItem, ClaimOut, ClaimStatus, Page } from "@acuity/types";
import { api, type RequestOptions } from "../../client";

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
  options?: RequestOptions,
): Promise<Page<ClaimListItem>> {
  return api.get<Page<ClaimListItem>>("/admin/claims", { ...options, query });
}

export function getClaimOversight(
  claimId: number,
  options?: RequestOptions,
): Promise<ClaimOut> {
  return api.get<ClaimOut>(`/admin/claims/${claimId}`, options);
}
