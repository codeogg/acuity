// frontend-only: pending backend
//
// Operator audit trail — the backend's operation_log table exists but nothing
// writes or reads it, so the console reads mock events and client-driven
// actions (impersonation start/end/abandoned, act-as edits) record events here.
// Read-only, surrogate-only field set, no PHI.

import type { AuditActionClass, AuditEvent, AuditEventCreate, Page } from "@acuity/types";
import { api } from "../../client";

export type { AuditActionClass, AuditEvent, AuditEventCreate };

// A type alias (not interface) so it is assignable to the client's query index
// signature.
export type ListAuditEventsQuery = {
  page?: number;
  page_size?: number;
  operator?: string;
  action?: string;
  clinic_code?: string;
};

export function listAuditEvents(query: ListAuditEventsQuery = {}): Promise<Page<AuditEvent>> {
  return api.get<Page<AuditEvent>>("/admin/audit-events", { query });
}

export function recordAuditEvent(body: AuditEventCreate): Promise<AuditEvent> {
  return api.post<AuditEvent>("/admin/audit-events", body);
}
