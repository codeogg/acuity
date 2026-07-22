// frontend-only: pending backend — DEPRECATED
//
// Prefer `@acuity/api-client` `audit` endpoints (`/admin/audit-logs`).
// Kept as thin aliases so residual imports compile during migration.

import type { AuditLogCreate, AuditLogOut, Page } from "@acuity/types";
import { createAuditLog, listAuditLogs, type ListAuditLogsQuery } from "../audit";

export type AuditEvent = AuditLogOut;
export type AuditEventCreate = AuditLogCreate;
export type AuditActionClass = string;

export type ListAuditEventsQuery = ListAuditLogsQuery & {
  operator?: string;
  action?: string;
  clinic_code?: string;
};

export function listAuditEvents(query: ListAuditEventsQuery = {}): Promise<Page<AuditLogOut>> {
  const { operator: _o, action, clinic_code: _c, ...rest } = query;
  return listAuditLogs({
    ...rest,
    action_type: action ?? rest.action_type,
  });
}

export function recordAuditEvent(body: AuditLogCreate): Promise<AuditLogOut> {
  return createAuditLog(body);
}
