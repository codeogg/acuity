// frontend-only: pending backend
//
// Barrel for the frontend-only endpoint modules. Registered in
// ../frontend-only.registry.json; each module carries the
// "frontend-only: pending backend" marker in its header.

export * as accountManagement from "./account-management";
export * as coverageRegistry from "./coverage-registry";
export * as documentInbox from "./document-inbox";
export * as claimExtensions from "./claim-extensions";
export * as staffHandoff from "./staff-handoff";
export * as doctorSettings from "./doctor-settings";
export * as notifications from "./notifications";
export * as supportAccess from "./support-access";
export * as authFlow from "./auth-flow";
export * as adminAudit from "./admin-audit";
export * as adminTickets from "./admin-tickets";
export * as adminTags from "./admin-tags";
export * as adminAnalytics from "./admin-analytics";
export * as adminSavedViews from "./admin-saved-views";
export * as adminImpersonation from "./admin-impersonation";
export * as adminClaimsOversight from "./admin-claims-oversight";
