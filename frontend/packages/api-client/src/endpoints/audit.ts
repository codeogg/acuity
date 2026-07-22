// Admin audit trail — unified append-only /api/admin/audit-logs.

import type { AuditLogCreate, AuditLogOut, Page } from "@acuity/types";
import { api, type RequestOptions } from "../client";

export type { AuditLogCreate, AuditLogOut };

export type ListAuditLogsQuery = {
  page?: number;
  page_size?: number;
  scope?: "global" | "clinic";
  operator_id?: number;
  action_type?: string;
  clinic_id?: number;
};

export function listAuditLogs(
  query: ListAuditLogsQuery = {},
  options?: RequestOptions,
): Promise<Page<AuditLogOut>> {
  return api.get<Page<AuditLogOut>>("/admin/audit-logs", { ...options, query });
}

export function getAuditLog(
  eventCode: string,
  options?: RequestOptions,
): Promise<AuditLogOut> {
  return api.get<AuditLogOut>(`/admin/audit-logs/${encodeURIComponent(eventCode)}`, options);
}

export function createAuditLog(
  body: AuditLogCreate,
  options?: RequestOptions,
): Promise<AuditLogOut> {
  return api.post<AuditLogOut>("/admin/audit-logs", body, options);
}
