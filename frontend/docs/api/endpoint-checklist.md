# Frontend endpoint checklist — backend to-do

**Generated:** by `packages/api-client/scripts/gen-endpoint-checklist.mjs` (re-run to refresh; do not edit by hand).
**Source:** `packages/types/openapi.json` (the canonical contract) joined with `packages/api-client/src/endpoints/frontend-only.registry.json` (frontend-implementation metadata).
**Parity guarantee:** `packages/api-client/scripts/verify-data-layer.mjs` asserts spec-registry parity plus one typed function and one MSW handler per operation.

Every row is an endpoint the frontend calls. **EXISTS** = implemented by the demo backend; **MISSING** = the frontend needs it and the demo API has no equivalent; **PARTIAL** = backend substrate exists but no usable API; **DRIFT** = overlaps or conflicts with an existing contract op (reconcile with the backend); **FUTURE-AUTH** = spec-target auth-provider journey beyond the demo backend. Contract dialect (full statement in the spec's `info.description` and `docs/api/implementation-notes.md`): snake_case, `{items,total,page,page_size}` list envelope, `{error:{code,message}}` error envelope (messages may be Chinese), JWT bearer / httpOnly `access_token` cookie auth, cross-tenant -> 404 not 403, `row_version` optimistic lock -> 409.

## Summary

| Status | Count |
|---|---|
| EXISTS | 84 |
| DRIFT | 15 |
| PARTIAL | 0 |
| MISSING | 31 |
| FUTURE-AUTH | 9 |
| **Total frontend endpoints** | **140** |

## Doctor app (`apps/app`) — /doctor/*

| Status | Method | Path | Notes |
|---|---|---|---|
| EXISTS | POST | `/api/doctor/ai/extract` | Extract |
| EXISTS | GET | `/api/doctor/claims` | List Claims |
| EXISTS | POST | `/api/doctor/claims` | Create Claim |
| EXISTS | GET | `/api/doctor/claims/{claim_id}` | Get Claim |
| EXISTS | POST | `/api/doctor/claims/{claim_id}/cancel` | Cancel |
| EXISTS | POST | `/api/doctor/claims/{claim_id}/confirm` | Confirm |
| EXISTS | PUT | `/api/doctor/claims/{claim_id}/draft` | Save Draft |
| EXISTS | POST | `/api/doctor/claims/{claim_id}/extract` | Extract Claim |
| EXISTS | PUT | `/api/doctor/claims/{claim_id}/fields` | Update Fields — Request body carries the declared extensions `confirmed` + `row_version` (see FieldsUpdate). The backend should persist per-field confirmation and enforce the optimistic lock (409 on stale row_version) when it lands the claim-level row_version. |
| EXISTS | POST | `/api/doctor/claims/{claim_id}/generate-pdf` | Generate Pdf |
| EXISTS | POST | `/api/doctor/claims/{claim_id}/mark-printed` | Mark Printed |
| EXISTS | PUT | `/api/doctor/claims/{claim_id}/medical-record` | Submit Medical Record |
| EXISTS | POST | `/api/doctor/claims/{claim_id}/reuse-for-template` | Reuse For Template |
| EXISTS | GET | `/api/doctor/home/overview` | Home Overview |
| EXISTS | GET | `/api/doctor/insurance-companies` | List Companies |
| EXISTS | GET | `/api/doctor/insurance-companies/{company_id}/templates` | List Templates |
| DRIFT | DELETE | `/api/doctor/claims/{claim_id}` | `deleteClaim` — Intake source text + per-field confirmation set + row-version cursor, and history permanent-delete. Per-field confirmation state has no home in the current contract — the most load-bearing gap to raise. (matrix-app.md §9.10) — New permanent-delete operation, distinct from POST .../cancel; restricted to CANCELLED/DRAFT claims. |
| DRIFT | GET | `/api/doctor/coverage-registry` | `getCoverageRegistry` — Covered-vs-roadmap insurer/form registry driving form selection; coverage must never be overstated. (matrix-app.md §9.7/9.10) — also: site — Kept as a distinct, richer operation (covered-vs-roadmap registry) - not a rename of GET /api/doctor/insurance-companies. |
| MISSING | POST | `/api/doctor/claims/{claim_id}/handoff` | `createHandoff` — Staff-prepared claims handed to the doctor for review + sign-off (hand-off banner, work-home pending count). (matrix-app.md §10.3, §12 P0-3) |
| MISSING | GET | `/api/doctor/claims/{claim_id}/intake-text` | `getClaimIntakeText` — Intake source text + per-field confirmation set + row-version cursor, and history permanent-delete. Per-field confirmation state has no home in the current contract — the most load-bearing gap to raise. (matrix-app.md §9.10) |
| MISSING | GET | `/api/doctor/document-inbox` | `listInboxDocuments` — Virtual-printer captures + future upload channels awaiting intake import; the commissioned spec names a document inbox the demo backend lacks. (matrix-app.md §9.10; spec-compliance (document inbox missing)) |
| MISSING | POST | `/api/doctor/document-inbox/{document_id}/import` | `importInboxDocument` — Virtual-printer captures + future upload channels awaiting intake import; the commissioned spec names a document inbox the demo backend lacks. (matrix-app.md §9.10; spec-compliance (document inbox missing)) |
| MISSING | GET | `/api/doctor/handoffs` | `listHandoffs` — Staff-prepared claims handed to the doctor for review + sign-off (hand-off banner, work-home pending count). (matrix-app.md §10.3, §12 P0-3) |
| MISSING | POST | `/api/doctor/handoffs/{handoff_id}/accept` | `acceptHandoff` — Staff-prepared claims handed to the doctor for review + sign-off (hand-off banner, work-home pending count). (matrix-app.md §10.3, §12 P0-3) |
| MISSING | GET | `/api/doctor/notifications` | `listNotifications` — In-app notifications (hand-offs, AI drafts ready, published forms, system notices). (recovery task list (notifications)) — Paged from day one (unbounded list; audit §2-3). |
| MISSING | POST | `/api/doctor/notifications/{notification_id}/read` | `markNotificationRead` — In-app notifications (hand-offs, AI drafts ready, published forms, system notices). (recovery task list (notifications)) |
| MISSING | POST | `/api/doctor/notifications/read-all` | `markAllNotificationsRead` — In-app notifications (hand-offs, AI drafts ready, published forms, system notices). (recovery task list (notifications)) |
| MISSING | GET | `/api/doctor/print-captures` | `listPrintCaptures` — Virtual-printer captures + future upload channels awaiting intake import; the commissioned spec names a document inbox the demo backend lacks. (matrix-app.md §9.10; spec-compliance (document inbox missing)) |
| MISSING | GET | `/api/doctor/settings` | `getDoctorSettings` — Signature image persistence (consumed by produce), idle-lock threshold, trusted devices, delivery default. (matrix-app.md §4.9, §12 P2-17) |
| MISSING | PUT | `/api/doctor/settings` | `updateDoctorSettings` — Signature image persistence (consumed by produce), idle-lock threshold, trusted devices, delivery default. (matrix-app.md §4.9, §12 P2-17) |
| MISSING | GET | `/api/doctor/support-access` | `getSupportAccess` — Doctor-side support-access grants for operator impersonation (view-as / act-as), paired with admin-impersonation. (matrix-app.md §12 P0-2; matrix-admin.md §6) |
| MISSING | POST | `/api/doctor/support-access/grant` | `grantSupportAccess` — Doctor-side support-access grants for operator impersonation (view-as / act-as), paired with admin-impersonation. (matrix-app.md §12 P0-2; matrix-admin.md §6) |
| MISSING | POST | `/api/doctor/support-access/revoke` | `revokeSupportAccess` — Doctor-side support-access grants for operator impersonation (view-as / act-as), paired with admin-impersonation. (matrix-app.md §12 P0-2; matrix-admin.md §6) |

## Operator console (`apps/admin`) — /admin/*

| Status | Method | Path | Notes |
|---|---|---|---|
| EXISTS | GET | `/api/admin/audit-logs` | List Audit Logs |
| EXISTS | POST | `/api/admin/audit-logs` | Create Audit Log |
| EXISTS | GET | `/api/admin/audit-logs/{event_code}` | Get Audit Log |
| EXISTS | GET | `/api/admin/clinics` | List Clinics |
| EXISTS | POST | `/api/admin/clinics` | Create Clinic |
| EXISTS | DELETE | `/api/admin/clinics/{clinic_id}` | Delete Clinic |
| EXISTS | GET | `/api/admin/clinics/{clinic_id}` | Get Clinic |
| EXISTS | PUT | `/api/admin/clinics/{clinic_id}` | Update Clinic |
| EXISTS | GET | `/api/admin/clinics/{clinic_id}/config-overview` | Get Config Overview |
| EXISTS | PATCH | `/api/admin/clinics/{clinic_id}/flag` | Set Clinic Flag |
| EXISTS | GET | `/api/admin/clinics/{clinic_id}/insurance-companies` | Get Clinic Insurers |
| EXISTS | PUT | `/api/admin/clinics/{clinic_id}/insurance-companies` | Set Clinic Insurers |
| EXISTS | PATCH | `/api/admin/clinics/{clinic_id}/insurance-companies/{company_id}` | Toggle Company |
| EXISTS | PUT | `/api/admin/clinics/{clinic_id}/insurance-companies/{company_id}/templates` | Set Company Templates — Renamed from .../companies/{company_id}/templates for consistency with the sibling insurance-companies routes; the demo backend still serves the old segment - the backend applies the rename (or an alias) at integration. |
| EXISTS | GET | `/api/admin/clinics/{clinic_id}/retention` | Get Clinic Retention |
| EXISTS | GET | `/api/admin/clinics/{clinic_id}/retention/history` | List Clinic Retention History |
| EXISTS | POST | `/api/admin/clinics/{clinic_id}/retention/override` | Override Clinic Retention |
| EXISTS | PATCH | `/api/admin/clinics/{clinic_id}/status` | Update Status |
| EXISTS | GET | `/api/admin/clinics/{clinic_id}/subscription` | Get Clinic Subscription |
| EXISTS | PUT | `/api/admin/clinics/{clinic_id}/subscription` | Update Clinic Subscription |
| EXISTS | PATCH | `/api/admin/clinics/{clinic_id}/subscription/note` | Update Clinic Subscription Note |
| EXISTS | PATCH | `/api/admin/clinics/{clinic_id}/templates/{template_id}` | Toggle Template |
| EXISTS | GET | `/api/admin/doctors` | List Doctors |
| EXISTS | POST | `/api/admin/doctors` | Create Doctor |
| EXISTS | DELETE | `/api/admin/doctors/{doctor_id}` | Delete Doctor |
| EXISTS | GET | `/api/admin/doctors/{doctor_id}` | Get Doctor |
| EXISTS | PUT | `/api/admin/doctors/{doctor_id}` | Update Doctor |
| EXISTS | PUT | `/api/admin/doctors/{doctor_id}/account-notes` | Set Account Notes |
| EXISTS | POST | `/api/admin/doctors/{doctor_id}/reset-password` | Reset Password |
| EXISTS | PATCH | `/api/admin/doctors/{doctor_id}/status` | Update Status |
| EXISTS | GET | `/api/admin/field-domains` | List Domains |
| EXISTS | POST | `/api/admin/field-domains` | Create Domain |
| EXISTS | GET | `/api/admin/insurance-companies` | List Companies |
| EXISTS | POST | `/api/admin/insurance-companies` | Create Company |
| EXISTS | DELETE | `/api/admin/insurance-companies/{company_id}` | Delete Company |
| EXISTS | GET | `/api/admin/insurance-companies/{company_id}` | Get Company |
| EXISTS | PUT | `/api/admin/insurance-companies/{company_id}` | Update Company |
| EXISTS | PATCH | `/api/admin/insurance-companies/{company_id}/status` | Update Status |
| EXISTS | POST | `/api/admin/insurance-companies/logo` | Upload Logo |
| EXISTS | GET | `/api/admin/standard-fields` | List Fields |
| EXISTS | POST | `/api/admin/standard-fields` | Create Field |
| EXISTS | DELETE | `/api/admin/standard-fields/{field_id}` | Delete Field |
| EXISTS | PUT | `/api/admin/standard-fields/{field_id}` | Update Field |
| EXISTS | GET | `/api/admin/templates` | List Templates |
| EXISTS | POST | `/api/admin/templates` | Upload Template |
| EXISTS | DELETE | `/api/admin/templates/{template_id}` | Delete Template |
| EXISTS | GET | `/api/admin/templates/{template_id}` | Get Template |
| EXISTS | PUT | `/api/admin/templates/{template_id}` | Update Template |
| EXISTS | GET | `/api/admin/templates/{template_id}/fields` | List Fields |
| EXISTS | POST | `/api/admin/templates/{template_id}/fields` | Create Field |
| EXISTS | DELETE | `/api/admin/templates/{template_id}/fields/{field_id}` | Delete Field — Normalised to 204 No Content (the implemented backend returns 200 {"success": true}; entity deletes are 204 everywhere else). |
| EXISTS | PUT | `/api/admin/templates/{template_id}/fields/{field_id}` | Update Field |
| EXISTS | PATCH | `/api/admin/templates/{template_id}/fields/{field_id}/ignore` | Ignore Field |
| EXISTS | POST | `/api/admin/templates/{template_id}/fields/{field_id}/mapping` | Save Mapping — Normalised to the typed FieldMappingSaveResult (the implemented backend returns an untyped {"id", "success"} dict). |
| EXISTS | PATCH | `/api/admin/templates/{template_id}/fields/{field_id}/restore` | Restore Field |
| EXISTS | PUT | `/api/admin/templates/{template_id}/file` | Replace Template File |
| EXISTS | GET | `/api/admin/templates/{template_id}/parse-progress` | Get Parse Progress |
| EXISTS | POST | `/api/admin/templates/{template_id}/preview-fill` | Preview Fill |
| EXISTS | POST | `/api/admin/templates/{template_id}/publish` | Publish Template |
| EXISTS | GET | `/api/admin/templates/{template_id}/publish-preview` | Publish Preview |
| EXISTS | POST | `/api/admin/templates/{template_id}/reparse` | Reparse Template |
| EXISTS | GET | `/api/admin/transform-rules` | List Rules |
| EXISTS | POST | `/api/admin/transform-rules` | Create Rule |
| DRIFT | POST | `/api/admin/analytics/export` | `exportAnalytics` — Usage / funnel / verification / quality aggregates + surrogate-only export — now backed by FastAPI claim/clinic aggregates; MSW retained for mock-first. (matrix-admin.md §10, §3 D3, §5 DOC11) |
| DRIFT | GET | `/api/admin/analytics/funnel` | `getActivationFunnel` — Usage / funnel / verification / quality aggregates + surrogate-only export — now backed by FastAPI claim/clinic aggregates; MSW retained for mock-first. (matrix-admin.md §10, §3 D3, §5 DOC11) |
| DRIFT | GET | `/api/admin/analytics/overview` | `getAnalyticsOverview` — Usage / funnel / verification / quality aggregates + surrogate-only export — now backed by FastAPI claim/clinic aggregates; MSW retained for mock-first. (matrix-admin.md §10, §3 D3, §5 DOC11) |
| DRIFT | GET | `/api/admin/analytics/quality` | `getQualityReport` — Usage / funnel / verification / quality aggregates + surrogate-only export — now backed by FastAPI claim/clinic aggregates; MSW retained for mock-first. (matrix-admin.md §10, §3 D3, §5 DOC11) |
| DRIFT | GET | `/api/admin/analytics/usage` | `getUsageSeries` — Usage / funnel / verification / quality aggregates + surrogate-only export — now backed by FastAPI claim/clinic aggregates; MSW retained for mock-first. (matrix-admin.md §10, §3 D3, §5 DOC11) |
| DRIFT | GET | `/api/admin/analytics/verification` | `getVerificationReport` — Usage / funnel / verification / quality aggregates + surrogate-only export — now backed by FastAPI claim/clinic aggregates; MSW retained for mock-first. (matrix-admin.md §10, §3 D3, §5 DOC11) |
| DRIFT | GET | `/api/admin/claims` | `listClaimsOversight` — Admin-scoped claims list + detail (PHI-redacted) — now backed by FastAPI; MSW retained for mock-first. (matrix-admin.md §13 X2, §19 API4) — patient_name is null at portfolio level; final_field_values are returned for client-side masked reveal. |
| DRIFT | GET | `/api/admin/claims/{claim_id}` | `getClaimOversight` — Admin-scoped claims list + detail (PHI-redacted) — now backed by FastAPI; MSW retained for mock-first. (matrix-admin.md §13 X2, §19 API4) — patient_name and ai_raw_result redacted; final_field_values returned for client-side masked reveal. |
| DRIFT | GET | `/api/admin/onboarding-queue` | `listOnboardingQueue` — Operations tickets + onboarding queue — now backed by FastAPI ops_ticket tables; MSW retained for mock-first. (matrix-admin.md §9) |
| DRIFT | GET | `/api/admin/tickets` | `listTickets` — Operations tickets + onboarding queue — now backed by FastAPI ops_ticket tables; MSW retained for mock-first. (matrix-admin.md §9) |
| DRIFT | GET | `/api/admin/tickets/{ticket_id}` | `getTicket` — Operations tickets + onboarding queue — now backed by FastAPI ops_ticket tables; MSW retained for mock-first. (matrix-admin.md §9) |
| DRIFT | PUT | `/api/admin/tickets/{ticket_id}` | `updateTicket` — Operations tickets + onboarding queue — now backed by FastAPI ops_ticket tables; MSW retained for mock-first. (matrix-admin.md §9) |
| DRIFT | POST | `/api/admin/tickets/{ticket_id}/resolve` | `resolveTicket` — Operations tickets + onboarding queue — now backed by FastAPI ops_ticket tables; MSW retained for mock-first. (matrix-admin.md §9) |
| MISSING | PATCH | `/api/admin/clinics/{clinic_id}/notes` | `updateClinicNotes` — Account-clinic many-to-many, non-destructive lifecycle, operator notes, and login-issue tooling per dev ADR 0041; mock-first extensions on DoctorOut/ClinicOut until the backend lands them. (dev ADR 0041) |
| MISSING | PATCH | `/api/admin/doctors/{doctor_id}/account-model` | `updateDoctorAccountModel` — Account-clinic many-to-many, non-destructive lifecycle, operator notes, and login-issue tooling per dev ADR 0041; mock-first extensions on DoctorOut/ClinicOut until the backend lands them. (dev ADR 0041) |
| MISSING | POST | `/api/admin/doctors/{doctor_id}/clinics` | `linkDoctorClinic` — Account-clinic many-to-many, non-destructive lifecycle, operator notes, and login-issue tooling per dev ADR 0041; mock-first extensions on DoctorOut/ClinicOut until the backend lands them. (dev ADR 0041) |
| MISSING | PUT | `/api/admin/doctors/{doctor_id}/clinics` | `setDoctorClinics` — Account-clinic many-to-many, non-destructive lifecycle, operator notes, and login-issue tooling per dev ADR 0041; mock-first extensions on DoctorOut/ClinicOut until the backend lands them. (dev ADR 0041) — Closes the ADR 0041 decision-2 switch gap with set-collection semantics, mirroring PUT /api/admin/clinics/{clinic_id}/insurance-companies. |
| MISSING | DELETE | `/api/admin/doctors/{doctor_id}/clinics/{clinic_id}` | `unlinkDoctorClinic` — Account-clinic many-to-many, non-destructive lifecycle, operator notes, and login-issue tooling per dev ADR 0041; mock-first extensions on DoctorOut/ClinicOut until the backend lands them. (dev ADR 0041) |
| MISSING | POST | `/api/admin/doctors/{doctor_id}/reset-mfa` | `resetDoctorMfa` — Account-clinic many-to-many, non-destructive lifecycle, operator notes, and login-issue tooling per dev ADR 0041; mock-first extensions on DoctorOut/ClinicOut until the backend lands them. (dev ADR 0041) |
| MISSING | POST | `/api/admin/doctors/{doctor_id}/unlock` | `unlockDoctorAccount` — Account-clinic many-to-many, non-destructive lifecycle, operator notes, and login-issue tooling per dev ADR 0041; mock-first extensions on DoctorOut/ClinicOut until the backend lands them. (dev ADR 0041) |
| MISSING | POST | `/api/admin/impersonation/end` | `endImpersonation` — Operator-side impersonation sessions; server-persisted so the banner survives reload, moving toward the server-rendered invariant. Lifecycle emits audit events. (matrix-admin.md §6, §21 item 12) |
| MISSING | GET | `/api/admin/impersonation/session` | `getImpersonationSession` — Operator-side impersonation sessions; server-persisted so the banner survives reload, moving toward the server-rendered invariant. Lifecycle emits audit events. (matrix-admin.md §6, §21 item 12) |
| MISSING | POST | `/api/admin/impersonation/start` | `startImpersonation` — Operator-side impersonation sessions; server-persisted so the banner survives reload, moving toward the server-rendered invariant. Lifecycle emits audit events. (matrix-admin.md §6, §21 item 12) — Start/end/abandon emit audit events. |
| MISSING | GET | `/api/admin/tags` | `listTags` — Form-tag taxonomy + per-doctor visibility matrix — an absent console destination with no backend support. Retire re-maps, never orphans. (matrix-admin.md §8) |
| MISSING | POST | `/api/admin/tags` | `createTag` — Form-tag taxonomy + per-doctor visibility matrix — an absent console destination with no backend support. Retire re-maps, never orphans. (matrix-admin.md §8) |
| MISSING | PUT | `/api/admin/tags/{tag_id}` | `updateTag` — Form-tag taxonomy + per-doctor visibility matrix — an absent console destination with no backend support. Retire re-maps, never orphans. (matrix-admin.md §8) |
| MISSING | POST | `/api/admin/tags/{tag_id}/retire` | `retireTag` — Form-tag taxonomy + per-doctor visibility matrix — an absent console destination with no backend support. Retire re-maps, never orphans. (matrix-admin.md §8) |
| MISSING | GET | `/api/admin/tags/visibility` | `getTagVisibility` — Form-tag taxonomy + per-doctor visibility matrix — an absent console destination with no backend support. Retire re-maps, never orphans. (matrix-admin.md §8) |
| MISSING | PUT | `/api/admin/tags/visibility` | `setTagVisibility` — Form-tag taxonomy + per-doctor visibility matrix — an absent console destination with no backend support. Retire re-maps, never orphans. (matrix-admin.md §8) |

## Auth journeys (`packages/auth-ui`, mounted in app + console) — /auth/*

| Status | Method | Path | Notes |
|---|---|---|---|
| implemented | POST | `/api/auth/mfa/verify-backup-code` | Verify MFA with a one-time backup recovery code |
| EXISTS | POST | `/api/auth/login` | Login — Backend asks (non-contract): rate-limit this endpoint (ADR 0040 compensating control) and make the session cookie's `secure` flag environment-driven (hardcoded False in the demo). The token is returned in the body AND set as the httpOnly cookie; browser clients use the cookie. |
| EXISTS | POST | `/api/auth/logout` | Logout — Normalised to the typed SuccessResponse (the implemented backend returns an ad-hoc dict). |
| EXISTS | GET | `/api/auth/me` | Me |
| EXISTS | PATCH | `/api/auth/me` | Update current user profile |
| FUTURE-AUTH | GET | `/api/auth/clinics` | `listAccountClinics` — The folded-auth journey beyond demo login/me/logout: MFA challenge/verify (TOTP + backup code), account discovery + clinic selection, recovery, session state/refresh, session-expiry deep-link token + return-target allowlist. WorkOS + MFA spec target behind the AuthAdapter seam. (matrix-auth.md §1.8/1.9, P0-2) — also: app, admin |
| FUTURE-AUTH | POST | `/api/auth/clinics/select` | `selectClinic` — The folded-auth journey beyond demo login/me/logout: MFA challenge/verify (TOTP + backup code), account discovery + clinic selection, recovery, session state/refresh, session-expiry deep-link token + return-target allowlist. WorkOS + MFA spec target behind the AuthAdapter seam. (matrix-auth.md §1.8/1.9, P0-2) — also: app, admin |
| FUTURE-AUTH | POST | `/api/auth/mfa/challenge` | `beginMfaChallenge` — The folded-auth journey beyond demo login/me/logout: MFA challenge/verify (TOTP + backup code), account discovery + clinic selection, recovery, session state/refresh, session-expiry deep-link token + return-target allowlist. WorkOS + MFA spec target behind the AuthAdapter seam. (matrix-auth.md §1.8/1.9, P0-2) — also: app, admin |
| FUTURE-AUTH | POST | `/api/auth/mfa/verify` | `verifyMfa` — The folded-auth journey beyond demo login/me/logout: MFA challenge/verify (TOTP + backup code), account discovery + clinic selection, recovery, session state/refresh, session-expiry deep-link token + return-target allowlist. WorkOS + MFA spec target behind the AuthAdapter seam. (matrix-auth.md §1.8/1.9, P0-2) — also: app, admin |
| FUTURE-AUTH | POST | `/api/auth/recovery/start` | `startRecovery` — The folded-auth journey beyond demo login/me/logout: MFA challenge/verify (TOTP + backup code), account discovery + clinic selection, recovery, session state/refresh, session-expiry deep-link token + return-target allowlist. WorkOS + MFA spec target behind the AuthAdapter seam. (matrix-auth.md §1.8/1.9, P0-2) — also: app, admin |
| FUTURE-AUTH | GET | `/api/auth/session` | `getSession` — The folded-auth journey beyond demo login/me/logout: MFA challenge/verify (TOTP + backup code), account discovery + clinic selection, recovery, session state/refresh, session-expiry deep-link token + return-target allowlist. WorkOS + MFA spec target behind the AuthAdapter seam. (matrix-auth.md §1.8/1.9, P0-2) — also: app, admin |
| FUTURE-AUTH | POST | `/api/auth/session/deep-link` | `issueDeepLinkToken` — The folded-auth journey beyond demo login/me/logout: MFA challenge/verify (TOTP + backup code), account discovery + clinic selection, recovery, session state/refresh, session-expiry deep-link token + return-target allowlist. WorkOS + MFA spec target behind the AuthAdapter seam. (matrix-auth.md §1.8/1.9, P0-2) — also: app, admin |
| FUTURE-AUTH | POST | `/api/auth/session/deep-link/redeem` | `redeemDeepLinkToken` — The folded-auth journey beyond demo login/me/logout: MFA challenge/verify (TOTP + backup code), account discovery + clinic selection, recovery, session state/refresh, session-expiry deep-link token + return-target allowlist. WorkOS + MFA spec target behind the AuthAdapter seam. (matrix-auth.md §1.8/1.9, P0-2) — also: app, admin |
| FUTURE-AUTH | POST | `/api/auth/session/refresh` | `refreshSession` — The folded-auth journey beyond demo login/me/logout: MFA challenge/verify (TOTP + backup code), account discovery + clinic selection, recovery, session state/refresh, session-expiry deep-link token + return-target allowlist. WorkOS + MFA spec target behind the AuthAdapter seam. (matrix-auth.md §1.8/1.9, P0-2) — also: app, admin |

## Shared (`/health`, cross-surface)

| Status | Method | Path | Notes |
|---|---|---|---|
| EXISTS | GET | `/health` | Health |

## Body extensions on contract ops (backend asks)

Extra fields the frontend sends on real contract operations — folded into the canonical schemas as optional properties and declared here rather than drifting silently.

| Status | Operation | Extended type | Added fields | Module |
|---|---|---|---|---|
| DRIFT | `PUT /api/doctor/claims/{claim_id}/fields` | `FieldsUpdateExtended` | `confirmed`, `row_version` | claim-extensions |
| MISSING | `GET /api/doctor/claims` | `ClaimListItemClinic` | `clinic_id`, `clinic_name` | claim-extensions |
| FUTURE-AUTH | `POST /api/auth/login` | `AccountSessionExtension` | `mfa_enabled`, `merged_workspace` | auth-flow |
| FUTURE-AUTH | `GET /api/auth/me` | `AccountSessionExtension` | `mfa_enabled`, `merged_workspace` | auth-flow |
| FUTURE-AUTH | `GET /api/auth/clinics` | `AuthClinicList` | `workspace_separation` | auth-flow |
| FUTURE-AUTH | `GET /api/auth/session` | `SessionState` | `merged_workspace` | auth-flow |
| FUTURE-AUTH | `POST /api/auth/session/refresh` | `SessionState` | `merged_workspace` | auth-flow |

