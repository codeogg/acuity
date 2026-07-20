// In-memory state for the frontend-only surfaces (notifications, tickets, tags,
// saved views, hand-offs, settings, document inbox, support access /
// impersonation, audit events) — mutable copies of the fixture universe so the
// mock flows behave statefully (resolve a ticket, retire a tag, accept a
// hand-off, record an audit event).

import type { AuditEvent } from "../../endpoints/frontend-only/admin-audit";
import type {
  OnboardingQueueItem,
  Ticket,
} from "../../endpoints/frontend-only/admin-tickets";
import type { Tag, TagVisibilityEntry } from "../../endpoints/frontend-only/admin-tags";
import type { SavedView } from "../../endpoints/frontend-only/admin-saved-views";
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
  savedViews,
  supportAccess,
  tags,
  tagVisibility,
  tickets,
} from "../fixtures/universe";

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
  savedViews: SavedView[];
  auditEvents: AuditEvent[];
  impersonation: ImpersonationSession | null;
  nextId: number;
}

let state: FrontendOnlyState | null = null;

export function frontendOnlyState(): FrontendOnlyState {
  if (!state) {
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
      savedViews: structuredClone(savedViews),
      auditEvents: structuredClone(demoAudit),
      impersonation: null,
      nextId: 1,
    };
  }
  return state;
}

export function nextFrontendOnlyId(prefix: string): string {
  return `${prefix}-${frontendOnlyState().nextId++}`;
}

// Prepend a new audit event (the trail renders newest-first). Uses the house
// timestamp form the console displays.
export function recordAuditEvent(
  input: Omit<AuditEvent, "id" | "ts">,
): AuditEvent {
  const s = frontendOnlyState();
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} at ${pad(now.getHours())}.${pad(now.getMinutes())}.${pad(now.getSeconds())}`;
  const event: AuditEvent = {
    id: `EV-${9100 + s.auditEvents.length}`,
    ts,
    ...input,
  };
  s.auditEvents.unshift(event);
  return event;
}

// Test/dev helper.
export function resetFrontendOnlyStore(): void {
  state = null;
}
