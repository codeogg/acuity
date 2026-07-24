// Doctor-app impersonation entry / exit — dedicated paths, not /auth/login.
// Plus post-session support-access pending / acknowledge (design 5.6).

import type { SuccessResponse } from "@acuity/types";
import { api } from "../client";

export type ImpersonationWireMode = "view" | "proxy";

export type ImpersonationContext = {
  session_id: number;
  operator_id: number;
  doctor_id: number;
  clinic_id: number;
  mode: ImpersonationWireMode;
};

export type ImpersonationEntryResponse = {
  access_token: string;
  token_type: string;
  role: string;
  user_id: number;
  clinic_id: number;
  display_name: string | null;
  impersonation: ImpersonationContext;
};

export type SupportAccessPendingItem = {
  session_id: number;
  clinic_id: number;
  clinic_name: string | null;
  doctor_id: number;
  operator_id: number;
  operator: string;
  mode: ImpersonationWireMode;
  status: "ended" | "expired";
  reason: string | null;
  started_at: string;
  ended_at: string | null;
  expire_at: string;
  doctor_notified_at: string;
};

export type SupportAccessPendingOut = {
  items: SupportAccessPendingItem[];
};

export function enterImpersonation(body: {
  token: string;
}): Promise<ImpersonationEntryResponse> {
  return api.post<ImpersonationEntryResponse>(
    "/doctor/session/impersonation-entry",
    body,
  );
}

export function exitImpersonation(): Promise<SuccessResponse> {
  return api.post<SuccessResponse>("/doctor/session/impersonation-exit");
}

/** Login-success async fetch: unread ended support sessions (non-blocking). */
export function listPendingSupportAccess(): Promise<SupportAccessPendingOut> {
  return api.get<SupportAccessPendingOut>("/doctor/support-access/pending");
}

export function acknowledgeSupportAccess(
  sessionId: number,
): Promise<SuccessResponse> {
  return api.post<SuccessResponse>("/doctor/support-access/acknowledge", {
    session_id: sessionId,
  });
}
