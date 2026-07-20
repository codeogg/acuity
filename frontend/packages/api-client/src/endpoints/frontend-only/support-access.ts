// frontend-only: pending backend
//
// Doctor-side support access — the grant/revoke seam for operator impersonation
// (view-as / act-as). The doctor app shows a support-access dialog + the
// impersonation state; the operator console drives sessions via
// admin-impersonation. Every grant/session emits an audit event.

import type {
  ImpersonationMode,
  SuccessResponse,
  SupportAccessGrant,
  SupportAccessGrantRequest,
  SupportAccessState,
} from "@acuity/types";
import { api } from "../../client";

export type { ImpersonationMode, SupportAccessGrant, SupportAccessGrantRequest, SupportAccessState };

export function getSupportAccess(): Promise<SupportAccessState> {
  return api.get<SupportAccessState>("/doctor/support-access");
}

export function grantSupportAccess(
  body: SupportAccessGrantRequest,
): Promise<SupportAccessGrant> {
  return api.post<SupportAccessGrant>("/doctor/support-access/grant", body);
}

export function revokeSupportAccess(grantId: string): Promise<SuccessResponse> {
  return api.post<SuccessResponse>("/doctor/support-access/revoke", { grant_id: grantId });
}
