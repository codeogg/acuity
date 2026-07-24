// Operator-side impersonation sessions (support access). Start returns a
// one-shot entry_url for window.open into the doctor app; end is separate.
// UI still uses view-as / act-as labels; the wire mode is view / proxy.

import type { SuccessResponse } from "@acuity/types";
import { api } from "../../client";

/** Backend wire mode (design doc). */
export type ImpersonationWireMode = "view" | "proxy";

export type ImpersonationStartRequest = {
  clinic_id: number;
  doctor_id: number;
  mode: ImpersonationWireMode;
  confirmed?: boolean;
  reason?: string | null;
  duration_minutes?: number;
};

/** Align with backend ImpersonationSessionOut (start response). */
export type ImpersonationStartResponse = {
  session_id: number;
  clinic_id: number;
  doctor_id: number;
  operator_id: number;
  operator: string;
  /** Wire mode; legacy mock/UI may still surface view-as / act-as. */
  mode: ImpersonationWireMode | "view-as" | "act-as";
  status: "active" | "ended" | "expired";
  reason?: string | null;
  started_at: string;
  expire_at: string;
  reused: boolean;
  token: string | null;
  entry_url: string | null;
};

export type ImpersonationSessionState = {
  active: ImpersonationStartResponse | null;
};

/** @deprecated Prefer ImpersonationStartResponse; kept for mock store banners. */
export type ImpersonationSession = ImpersonationStartResponse & {
  /** Legacy mock field some UI still reads. */
  id?: string;
  expires_at?: string;
};

export function getImpersonationSession(
  params?: { clinic_id: number; doctor_id: number },
): Promise<ImpersonationSessionState> {
  if (params) {
    const q = new URLSearchParams({
      clinic_id: String(params.clinic_id),
      doctor_id: String(params.doctor_id),
    });
    return api.get<ImpersonationSessionState>(`/admin/impersonation/session?${q}`);
  }
  // Mock / console banner: single active session without clinic filter.
  return api.get<ImpersonationSessionState>("/admin/impersonation/session");
}

export function startImpersonation(
  body: ImpersonationStartRequest,
): Promise<ImpersonationStartResponse> {
  return api.post<ImpersonationStartResponse>("/admin/impersonation/start", body);
}

export function endImpersonation(body: {
  clinic_id: number;
  doctor_id: number;
}): Promise<SuccessResponse> {
  return api.post<SuccessResponse>("/admin/impersonation/end", body);
}
