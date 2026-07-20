// The shared fixture layer: one coherent universe (universe.ts over
// universe.json) + the doctor-facing field-schema model. Apps import via
// "@acuity/api-client/mocks/fixtures".

export * from "./field-schema";
export * from "./universe";

// The frontend-only shapes the fixture universe instantiates, re-exported so
// fixture consumers resolve them from one place.
export type {
  CoverageForm,
  CoverageInsurer,
  CoverageStatus,
} from "../../endpoints/frontend-only/coverage-registry";
export type {
  CaptureRecord,
  InboxDocument,
  InboxDocumentStatus,
} from "../../endpoints/frontend-only/document-inbox";
export type { HandoffStatus, StaffHandoff } from "../../endpoints/frontend-only/staff-handoff";
export type { DoctorSettings, TrustedDevice } from "../../endpoints/frontend-only/doctor-settings";
export type { NotificationItem, NotificationKind } from "../../endpoints/frontend-only/notifications";
export type {
  SupportAccessGrant,
  SupportAccessState,
} from "../../endpoints/frontend-only/support-access";
export type { AuditActionClass, AuditEvent } from "../../endpoints/frontend-only/admin-audit";
export type {
  OnboardingQueueItem,
  Ticket,
  TicketStatus,
} from "../../endpoints/frontend-only/admin-tickets";
export type { Tag, TagKind, TagVisibilityEntry } from "../../endpoints/frontend-only/admin-tags";
export type { SavedView } from "../../endpoints/frontend-only/admin-saved-views";
export type {
  ActivationFunnel,
  AnalyticsOverview,
  QualityReport,
  UsagePoint,
  VerificationReport,
} from "../../endpoints/frontend-only/admin-analytics";
