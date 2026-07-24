// In-memory state for the frontend-only surfaces (notifications, tickets, tags,
// hand-offs, settings, document inbox, support access / impersonation, audit
// logs) — mutable copies of the fixture universe so the mock flows behave
// statefully.

import type { AuditActionType, AuditLogOut } from "@acuity/types";
import type {
  OnboardingQueueItem,
  Ticket,
} from "../../endpoints/frontend-only/admin-tickets";
import type { Tag, TagVisibilityEntry } from "../../endpoints/frontend-only/admin-tags";
import type { ImpersonationSession } from "../../endpoints/frontend-only/admin-impersonation";
import type { DoctorSettings } from "../../endpoints/frontend-only/doctor-settings";
import type { InboxDocument } from "../../endpoints/frontend-only/document-inbox";
import type { NotificationItem } from "../../endpoints/frontend-only/notifications";
import type { StaffHandoff } from "../../endpoints/frontend-only/staff-handoff";
import type { SupportAccessState } from "../../endpoints/frontend-only/support-access";
import {
  demoAudit,
  doctorSettings,
  handoffs,
  notifications,
  onboardingQueue,
  printCaptures,
  supportAccess,
  tags,
  tagVisibility,
  tickets,
} from "../fixtures/universe";

const ACTION_MAP: Record<string, AuditActionType> = {
  "account-created": "account_creation",
  "impersonation-start": "simulation_start",
  "impersonation-end": "simulation_end",
  "impersonation-abandoned": "simulation_interrupt",
  "act-as-edit": "proxy_edit",
  "retention-override": "retention_override",
  "template-publish": "template_publish",
  "template-archive": "template_archive",
  "crm-edit": "crm_billing_edit",
  "tag-change": "tag_category_change",
  "bulk-operation": "batch_operation",
  export: "export",
  "phi-reveal": "patient_data_view",
};

function parseHouseTimestamp(ts: string): string {
  const iso = ts.replace(" at ", "T").replaceAll(".", ":");
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function migrateDemoAudit(): AuditLogOut[] {
  return (demoAudit as Array<{
    id: string;
    ts: string;
    operator: string;
    action: string;
    target: string;
    mode: "view-as" | "act-as" | null;
  }>).map((e, i) => ({
    id: i + 1,
    event_code: e.id,
    action_type: ACTION_MAP[e.action] ?? "batch_operation",
    operator_id: 1,
    operator_name: e.operator,
    clinic_id: null,
    target_ref: e.target,
    mode: e.mode,
    field_set: null,
    detail: null,
    created_at: parseHouseTimestamp(e.ts),
  }));
}

export interface FrontendOnlyState {
  notifications: NotificationItem[];
  inboxDocuments: InboxDocument[];
  handoffs: StaffHandoff[];
  settings: DoctorSettings;
  supportAccess: SupportAccessState;
  tickets: Ticket[];
  onboardingQueue: OnboardingQueueItem[];
  tags: Tag[];
  tagVisibility: TagVisibilityEntry[];
  auditLogs: AuditLogOut[];
  impersonation: ImpersonationSession | null;
  nextId: number;
  nextAuditSeq: number;
}

let state: FrontendOnlyState | null = null;

export function frontendOnlyState(): FrontendOnlyState {
  if (!state) {
    const auditLogs = migrateDemoAudit();
    const maxEv = auditLogs.reduce((n, row) => {
      const m = /^EV-(\d+)$/.exec(row.event_code);
      return m ? Math.max(n, Number(m[1])) : n;
    }, 9000);
    state = {
      notifications: structuredClone(notifications),
      inboxDocuments: structuredClone(printCaptures),
      handoffs: structuredClone(handoffs),
      settings: structuredClone(doctorSettings),
      supportAccess: structuredClone(supportAccess),
      tickets: structuredClone(tickets),
      onboardingQueue: structuredClone(onboardingQueue),
      tags: structuredClone(tags),
      tagVisibility: structuredClone(tagVisibility),
      auditLogs,
      impersonation: null,
      nextId: 1,
      nextAuditSeq: maxEv + 1,
    };
  }
  return state;
}

export function nextFrontendOnlyId(prefix: string): string {
  return `${prefix}-${frontendOnlyState().nextId++}`;
}

export type RecordAuditLogInput = {
  action_type: AuditActionType;
  operator_id?: number;
  operator_name?: string;
  clinic_id?: number | null;
  target_ref?: string | null;
  mode?: "view-as" | "act-as" | null;
  field_set?: string | null;
  detail?: Record<string, unknown> | null;
};

/** Prepend a unified audit log row (newest-first). */
export function recordAuditLog(input: RecordAuditLogInput): AuditLogOut {
  const s = frontendOnlyState();
  const event: AuditLogOut = {
    id: s.auditLogs.length + 1,
    event_code: `EV-${s.nextAuditSeq++}`,
    action_type: input.action_type,
    operator_id: input.operator_id ?? 1,
    operator_name: input.operator_name ?? "you@acuity",
    clinic_id: input.clinic_id ?? null,
    target_ref: input.target_ref ?? null,
    mode: input.mode ?? null,
    field_set: input.field_set ?? null,
    detail: input.detail ?? null,
    created_at: new Date().toISOString(),
  };
  s.auditLogs.unshift(event);
  return event;
}

/** @deprecated Use recordAuditLog — kept for call-site migration. */
export function recordAuditEvent(input: {
  operator: string;
  action: string;
  target: string;
  mode: "view-as" | "act-as" | null;
}): AuditLogOut {
  return recordAuditLog({
    action_type: ACTION_MAP[input.action] ?? "batch_operation",
    operator_name: input.operator,
    target_ref: input.target,
    mode: input.mode,
  });
}

export function resetFrontendOnlyStore(): void {
  state = null;
}
