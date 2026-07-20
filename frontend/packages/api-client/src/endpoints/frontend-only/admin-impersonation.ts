// frontend-only: pending backend
//
// Operator-side impersonation sessions (support access). The signal must be
// server-rendered + fail-safe in the real product; the mock persists the
// session server-side (in the handler store) so the banner survives reloads.
// Start / end / abandon emit audit events.

import type {
  ImpersonationSession,
  ImpersonationSessionState,
  ImpersonationStartRequest,
  SuccessResponse,
} from "@acuity/types";
import { api } from "../../client";

export type { ImpersonationSession, ImpersonationSessionState, ImpersonationStartRequest };

export function getImpersonationSession(): Promise<ImpersonationSessionState> {
  return api.get<ImpersonationSessionState>("/admin/impersonation/session");
}

export function startImpersonation(
  body: ImpersonationStartRequest,
): Promise<ImpersonationSession> {
  return api.post<ImpersonationSession>("/admin/impersonation/start", body);
}

export function endImpersonation(): Promise<SuccessResponse> {
  return api.post<SuccessResponse>("/admin/impersonation/end");
}
