# Acuity API reference

**Generated** from [`packages/types/openapi.json`](../../packages/types/openapi.json) by `scripts/gen-api-docs.mjs` — do not edit by hand; re-run `pnpm run gen:api-docs` after spec changes.

Contract version: `1.0.0`. Intentional deviations from the implemented demo backend and the recorded Phase-1 deltas are in [implementation-notes.md](implementation-notes.md); the per-endpoint backend to-do view is [endpoint-checklist.md](endpoint-checklist.md).

## Contract dialect

Canonical Phase-1 API contract for the Acuity claim-form platform. This document is the single operation-level source of truth shared by the frontend (which generates its types and mock layer from it) and the backend team (for whom every operation not yet implemented is tagged with `x-backend-status`).

Dialect (adopted from the implemented backend):
- Role-prefixed paths: `/api/auth/*` (session), `/api/doctor/*` (doctor role, clinic-scoped), `/api/admin/*` (operator roles). Cross-tenant reads return 404, never 403.
- Integer sequential ids; human-facing codes (`submission_no`, `clinic_code`, `template_code`) where needed.
- snake_case fields end to end.
- Offset pagination `{items, total, page, page_size}` (`page` >= 1, `page_size` 1-100, default 20). Bounded catalogue lists are deliberately non-paged bare arrays; any list that can grow without bound is paged.
- Two status vocabularies by rule: integer 0/1 (`disabled`/`enabled`) on organisation entities (clinics, doctors, insurance companies, link rows); SCREAMING_SNAKE closed string state machines on workflow entities (claims, templates, template fields). New operations must not invent a third.
- Errors: domain failures use the `ErrorEnvelope` (`{"error": {code, message, request_id?}}`) with the closed `ErrorCode` enum; request-shape validation failures keep FastAPI's native 422 `HTTPValidationError` (`{"detail": [...]}`). Both shapes are normative. `message` values may be Chinese; they are display candidates only - clients own user-facing copy via i18n.
- Auth: JWT (HS256) via `Authorization: Bearer` header or httpOnly `access_token` cookie; header wins when both are present. Password sign-in per ADR 0040. The tagged auth-flow extension group (MFA, account discovery, clinic selection, session refresh, re-auth deep links) is the target-auth journey behind the frontend's swappable auth adapter.
- `Idempotency-Key` is a reserved optional header on state-changing POST operations under `/api/admin` and `/api/doctor`; servers do not enforce it in Phase 1, so adding enforcement later is non-breaking.
- File/PDF fields are opaque URL strings. Production semantics are signed URLs: patient-document URLs (generated/preview/export PDFs) are short-lived presigned URLs; branding assets (logos, chops, signatures) may be long-lived or public. See each field's description and docs/api/implementation-notes.md.

Operations without `x-backend-status` are implemented by the backend today. Operations tagged `x-backend-status: MISSING | PARTIAL | DRIFT | FUTURE-AUTH` are the frontend-required forward contract the backend team builds (mock-implemented in full via MSW; see packages/api-client). Intentional Phase-1 deviations from the cross-cutting mandates of design 0001 (prefixed ULIDs, cursor pagination, /v1 path versioning, RFC 7807 errors, mandatory idempotency keys, response envelopes) are recorded in docs/api/implementation-notes.md.

## Operations by group

| Group | Operations | Backend status |
|---|---|---|
| [auth](#groupauth) | 4 | EXISTS |
| [admin:clinics](#groupadminclinics) | 19 | EXISTS |
| [admin:doctors](#groupadmindoctors) | 8 | EXISTS |
| [admin:insurance](#groupadmininsurance) | 7 | EXISTS |
| [admin:standard-fields](#groupadminstandardfields) | 8 | EXISTS |
| [admin:templates](#groupadmintemplates) | 18 | EXISTS |
| [doctor:ai](#groupdoctorai) | 1 | EXISTS |
| [doctor:claims](#groupdoctorclaims) | 15 | EXISTS |
| [claim-extensions](#groupclaimextensions) | 2 | DRIFT, MISSING |
| [system](#groupsystem) | 1 | EXISTS |
| [coverage-registry](#groupcoverageregistry) | 1 | DRIFT |
| [document-inbox](#groupdocumentinbox) | 3 | MISSING |
| [staff-handoff](#groupstaffhandoff) | 3 | MISSING |
| [doctor-settings](#groupdoctorsettings) | 2 | MISSING |
| [notifications](#groupnotifications) | 3 | MISSING |
| [support-access](#groupsupportaccess) | 3 | MISSING |
| [auth-flow](#groupauthflow) | 10 | FUTURE-AUTH, implemented |
| [admin-tickets](#groupadmintickets) | 5 | DRIFT |
| [admin-tags](#groupadmintags) | 6 | MISSING |
| [admin-analytics](#groupadminanalytics) | 6 | DRIFT |
| [admin-impersonation](#groupadminimpersonation) | 3 | MISSING |
| [admin-claims-oversight](#groupadminclaimsoversight) | 2 | DRIFT |
| [account-management](#groupaccountmanagement) | 7 | MISSING |
| [admin:audit](#groupadminaudit) | 3 | EXISTS |
| **Total** | **140** | |

## Group auth

Session base ops (password sign-in per ADR 0040): login, logout, current user.

### POST `/api/auth/login`

Login

> Backend asks (non-contract): rate-limit this endpoint (ADR 0040 compensating control) and make the session cookie's `secure` flag environment-driven (hardcoded False in the demo). The token is returned in the body AND set as the httpOnly cookie; browser clients use the cookie.

Auth: none

Request body: [LoginRequest](#loginrequest)

Responses:

- `200` — [LoginResponse](#loginresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/auth/logout`

Logout

> Normalised to the typed SuccessResponse (the implemented backend returns an ad-hoc dict).

Auth: none

Responses:

- `200` — [SuccessResponse](#successresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/auth/me`

Me

Auth: bearer / cookie

Responses:

- `200` — [MeResponse](#meresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/auth/me`

Update current user profile

Auth: bearer / cookie

Request body: [ProfileUpdateRequest](#profileupdaterequest)

Responses:

- `200` — [MeResponse](#meresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin:clinics

Clinic CRUD + per-clinic insurance-company and template enablement (operator console).

### GET `/api/admin/clinics`

List Clinics

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no |  |
| `page_size` | integer | no |  |
| `keyword` | string \| null | no |  |
| `sort` | string \| null | no |  |
| `is_flagged` | integer | no | Filter by needs-attention flag: 1 = flagged only, 0 = unflagged only. |

Responses:

- `200` — [Page_ClinicOut_](#pageclinicout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/clinics`

Create Clinic

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [ClinicCreate](#cliniccreate)

Responses:

- `200` — [ClinicOut](#clinicout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/clinics/{clinic_id}`

Get Clinic

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Responses:

- `200` — [ClinicOut](#clinicout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/clinics/{clinic_id}`

Update Clinic

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Request body: [ClinicUpdate](#clinicupdate)

Responses:

- `200` — [ClinicOut](#clinicout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### DELETE `/api/admin/clinics/{clinic_id}`

Delete Clinic

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Responses:

- `204` — Successful Response
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/clinics/{clinic_id}/status`

Update Status

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Request body: [ClinicStatusUpdate](#clinicstatusupdate)

Responses:

- `200` — [ClinicOut](#clinicout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/clinics/{clinic_id}/insurance-companies`

Get Clinic Insurers

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Responses:

- `200` — array of integer
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/clinics/{clinic_id}/insurance-companies`

Set Clinic Insurers

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Request body: [ClinicInsuranceUpdate](#clinicinsuranceupdate)

Responses:

- `200` — array of integer
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/clinics/{clinic_id}/config-overview`

Get Config Overview

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Responses:

- `200` — [ClinicConfigOverview](#clinicconfigoverview)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/clinics/{clinic_id}/insurance-companies/{company_id}`

Toggle Company

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |
| `company_id` | integer | yes |  |

Request body: [CompanyEnableUpdate](#companyenableupdate)

Responses:

- `200` — [CompanyEnableResult](#companyenableresult)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/clinics/{clinic_id}/insurance-companies/{company_id}/templates`

Set Company Templates

> Renamed from .../companies/{company_id}/templates for consistency with the sibling insurance-companies routes; the demo backend still serves the old segment - the backend applies the rename (or an alias) at integration.

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |
| `company_id` | integer | yes |  |

Request body: [ClinicTemplatesSet](#clinictemplatesset)

Responses:

- `200` — [ClinicTemplatesSetResult](#clinictemplatessetresult)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/clinics/{clinic_id}/templates/{template_id}`

Toggle Template

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |
| `template_id` | integer | yes |  |

Request body: [TemplateEnableUpdate](#templateenableupdate)

Responses:

- `200` — [TemplateEnableResult](#templateenableresult)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/clinics/{clinic_id}/flag`

Set Clinic Flag

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Request body: [ClinicFlagUpdate](#clinicflagupdate)

Responses:

- `200` — [ClinicOut](#clinicout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/clinics/{clinic_id}/subscription`

Get Clinic Subscription

1:1 commercial subscription record for a clinic (auto-creates a trial row if missing).

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Responses:

- `200` — [ClinicSubscriptionOut](#clinicsubscriptionout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/clinics/{clinic_id}/subscription`

Update Clinic Subscription

Update subscription status, plan, price, and payment fields (not notes).

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Request body: [ClinicSubscriptionUpdate](#clinicsubscriptionupdate)

Responses:

- `200` — [ClinicSubscriptionOut](#clinicsubscriptionout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/clinics/{clinic_id}/subscription/note`

Update Clinic Subscription Note

Independently update note_content / note_format; writes note_updated_by and note_updated_at.

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Request body: [ClinicSubscriptionNoteUpdate](#clinicsubscriptionnoteupdate)

Responses:

- `200` — [ClinicSubscriptionOut](#clinicsubscriptionout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/clinics/{clinic_id}/retention`

Get Clinic Retention

Effective retention days for a clinic (global default or override).

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Responses:

- `200` — [ClinicRetentionOut](#clinicretentionout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/clinics/{clinic_id}/retention/override`

Override Clinic Retention

Super-admin only. Requires clinic_code_input paste match. Writes audit + upserts override in one transaction.

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Request body: [ClinicRetentionOverrideRequest](#clinicretentionoverriderequest)

Responses:

- `200` — [ClinicRetentionOut](#clinicretentionout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/clinics/{clinic_id}/retention/history`

List Clinic Retention History

Append-only audit log for retention overrides, newest first.

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Responses:

- `200` — array of [ClinicRetentionAuditOut](#clinicretentionauditout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin:doctors

Doctor account CRUD + password reset (operator console).

### GET `/api/admin/doctors`

List Doctors

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no |  |
| `page_size` | integer | no |  |
| `clinic_id` | integer \| null | no |  |
| `keyword` | string \| null | no |  |

Responses:

- `200` — [Page_DoctorOut_](#pagedoctorout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/doctors`

Create Doctor

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [DoctorCreate](#doctorcreate)

Responses:

- `200` — [DoctorOut](#doctorout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/doctors/{doctor_id}`

Get Doctor

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Responses:

- `200` — [DoctorOut](#doctorout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/doctors/{doctor_id}`

Update Doctor

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Request body: [DoctorUpdate](#doctorupdate)

Responses:

- `200` — [DoctorOut](#doctorout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### DELETE `/api/admin/doctors/{doctor_id}`

Delete Doctor

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Responses:

- `204` — Successful Response
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/doctors/{doctor_id}/status`

Update Status

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Request body: [DoctorStatusUpdate](#doctorstatusupdate)

Responses:

- `200` — [DoctorOut](#doctorout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/doctors/{doctor_id}/reset-password`

Reset Password

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [ResetPasswordResponse](#resetpasswordresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/doctors/{doctor_id}/account-notes`

Set Account Notes

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Request body: [AccountNotesUpdate](#accountnotesupdate)

Responses:

- `200` — [DoctorOut](#doctorout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin:insurance

Insurance-company CRUD + logo upload (operator console).

### GET `/api/admin/insurance-companies`

List Companies

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no |  |
| `page_size` | integer | no |  |
| `keyword` | string \| null | no |  |

Responses:

- `200` — [Page_CompanyOut_](#pagecompanyout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/insurance-companies`

Create Company

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [CompanyCreate](#companycreate)

Responses:

- `200` — [CompanyOut](#companyout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/insurance-companies/logo`

Upload Logo

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body (multipart/form-data): [Body_upload_logo_api_admin_insurance_companies_logo_post](#bodyuploadlogoapiadmininsurancecompanieslogopost)

Responses:

- `200` — [LogoUploadResponse](#logouploadresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/insurance-companies/{company_id}`

Get Company

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |

Responses:

- `200` — [CompanyOut](#companyout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/insurance-companies/{company_id}`

Update Company

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |

Request body: [CompanyUpdate](#companyupdate)

Responses:

- `200` — [CompanyOut](#companyout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### DELETE `/api/admin/insurance-companies/{company_id}`

Delete Company

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |

Responses:

- `204` — Successful Response
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/insurance-companies/{company_id}/status`

Update Status

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |

Request body: [CompanyStatusUpdate](#companystatusupdate)

Responses:

- `200` — [CompanyOut](#companyout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin:standard-fields

Standard-field dictionary, field domains, and value transform rules.

### GET `/api/admin/field-domains`

List Domains

Non-paged by design: bounded catalogue set.

Auth: bearer / cookie

Responses:

- `200` — array of [DomainOut](#domainout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/field-domains`

Create Domain

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [DomainCreate](#domaincreate)

Responses:

- `200` — [DomainOut](#domainout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/standard-fields`

List Fields

Non-paged by design: bounded catalogue set.

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `domain_id` | integer \| null | no |  |
| `keyword` | string \| null | no |  |
| `active_only` | boolean | no |  |

Responses:

- `200` — array of [StandardFieldOut](#standardfieldout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/standard-fields`

Create Field

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [StandardFieldCreate](#standardfieldcreate)

Responses:

- `200` — [StandardFieldOut](#standardfieldout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/standard-fields/{field_id}`

Update Field

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `field_id` | integer | yes |  |

Request body: [StandardFieldUpdate](#standardfieldupdate)

Responses:

- `200` — [StandardFieldOut](#standardfieldout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### DELETE `/api/admin/standard-fields/{field_id}`

Delete Field

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `field_id` | integer | yes |  |

Responses:

- `204` — Successful Response
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/transform-rules`

List Rules

Non-paged by design: bounded catalogue set.

Auth: bearer / cookie

Responses:

- `200` — array of [TransformRuleOut](#transformruleout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/transform-rules`

Create Rule

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [TransformRuleCreate](#transformrulecreate)

Responses:

- `200` — [TransformRuleOut](#transformruleout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin:templates

Form-template upload, parsing, field annotation, mapping, and publication.

### GET `/api/admin/templates`

List Templates

Non-paged by design: bounded catalogue set.

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer \| null | no |  |

Responses:

- `200` — array of [TemplateOut](#templateout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/templates`

Upload Template

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body (multipart/form-data): [Body_upload_template_api_admin_templates_post](#bodyuploadtemplateapiadmintemplatespost)

Responses:

- `200` — [TemplateUploadResponse](#templateuploadresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/templates/{template_id}`

Get Template

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Responses:

- `200` — [TemplateOut](#templateout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/templates/{template_id}`

Update Template

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Request body: [TemplateUpdate](#templateupdate)

Responses:

- `200` — [TemplateOut](#templateout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### DELETE `/api/admin/templates/{template_id}`

Delete Template

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Responses:

- `204` — Successful Response
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/templates/{template_id}/file`

Replace Template File

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Request body (multipart/form-data): [Body_replace_template_file_api_admin_templates__template_id__file_put](#bodyreplacetemplatefileapiadmintemplatestemplateidfileput)

Responses:

- `200` — [TemplateFileReplaceResponse](#templatefilereplaceresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/templates/{template_id}/parse-progress`

Get Parse Progress

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Responses:

- `200` — [ParseProgressOut](#parseprogressout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/templates/{template_id}/reparse`

Reparse Template

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [ReparseResponse](#reparseresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/templates/{template_id}/fields`

List Fields

Non-paged by design: bounded catalogue set.

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Responses:

- `200` — array of [TemplateFieldOut](#templatefieldout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/templates/{template_id}/fields`

Create Field

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [TemplateFieldCreate](#templatefieldcreate)

Responses:

- `200` — [TemplateFieldOut](#templatefieldout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/templates/{template_id}/fields/{field_id}`

Update Field

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |
| `field_id` | integer | yes |  |

Request body: [TemplateFieldUpdate](#templatefieldupdate)

Responses:

- `200` — [TemplateFieldOut](#templatefieldout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### DELETE `/api/admin/templates/{template_id}/fields/{field_id}`

Delete Field

> Normalised to 204 No Content (the implemented backend returns 200 {"success": true}; entity deletes are 204 everywhere else).

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |
| `field_id` | integer | yes |  |

Responses:

- `204` — Field deleted.
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/templates/{template_id}/fields/{field_id}/mapping`

Save Mapping

> Normalised to the typed FieldMappingSaveResult (the implemented backend returns an untyped {"id", "success"} dict).

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |
| `field_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [FieldMappingSave](#fieldmappingsave)

Responses:

- `200` — [FieldMappingSaveResult](#fieldmappingsaveresult)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/templates/{template_id}/fields/{field_id}/ignore`

Ignore Field

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |
| `field_id` | integer | yes |  |

Request body: [FieldIgnoreSave](#fieldignoresave)

Responses:

- `200` — [TemplateFieldOut](#templatefieldout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/templates/{template_id}/fields/{field_id}/restore`

Restore Field

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |
| `field_id` | integer | yes |  |

Request body: [FieldRestoreSave](#fieldrestoresave)

Responses:

- `200` — [TemplateFieldOut](#templatefieldout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/templates/{template_id}/publish-preview`

Publish Preview

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Responses:

- `200` — [PublishPreviewOut](#publishpreviewout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/templates/{template_id}/preview-fill`

Preview Fill

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [PreviewFillRequest](#previewfillrequest)

Responses:

- `200` — [PreviewFillResponse](#previewfillresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/templates/{template_id}/publish`

Publish Template

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [TemplateOut](#templateout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group doctor:ai

Stateless AI extraction (per-clinic rate limit 20/min; 429 on breach, 503 when the AI provider is unavailable).

### POST `/api/doctor/ai/extract`

Extract

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [ExtractRequest](#extractrequest)

Responses:

- `200` — [ExtractResponse](#extractresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group doctor:claims

Doctor claim workflow: home overview, catalogue, claim state machine, PDF generation.

### GET `/api/doctor/home/overview`

Home Overview

Auth: bearer / cookie

Responses:

- `200` — [HomeOverview](#homeoverview)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/doctor/insurance-companies`

List Companies

Non-paged by design: bounded catalogue set.

Auth: bearer / cookie

Responses:

- `200` — array of [CompanyBrief](#companybrief)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/doctor/insurance-companies/{company_id}/templates`

List Templates

Non-paged by design: bounded catalogue set.

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |

Responses:

- `200` — array of [TemplateBrief](#templatebrief)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/doctor/claims`

List Claims

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `patient_name` | string \| null | no |  |
| `status` | string \| null | no |  |
| `date_from` | string (date-time) \| null | no |  |
| `date_to` | string (date-time) \| null | no |  |
| `page` | integer | no |  |
| `page_size` | integer | no |  |

Responses:

- `200` — [Page_ClaimListItem_](#pageclaimlistitem)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/claims`

Create Claim

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [ClaimCreate](#claimcreate)

Responses:

- `200` — [ClaimOut](#claimout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/doctor/claims/{claim_id}/draft`

Save Draft

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Request body: [DraftSave](#draftsave)

Responses:

- `200` — [DraftSaveResponse](#draftsaveresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/claims/{claim_id}/extract`

Extract Claim

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [ClaimOut](#claimout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/doctor/claims/{claim_id}/medical-record`

Submit Medical Record

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Request body: [MedicalRecordSubmit](#medicalrecordsubmit)

Responses:

- `200` — [ClaimOut](#claimout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/doctor/claims/{claim_id}/fields`

Update Fields

> Request body carries the declared extensions `confirmed` + `row_version` (see FieldsUpdate). The backend should persist per-field confirmation and enforce the optimistic lock (409 on stale row_version) when it lands the claim-level row_version.

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Request body: [FieldsUpdate](#fieldsupdate)

Responses:

- `200` — [ClaimOut](#claimout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/claims/{claim_id}/confirm`

Confirm

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [ClaimOut](#claimout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/claims/{claim_id}/generate-pdf`

Generate Pdf

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [GeneratePdfResponse](#generatepdfresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/claims/{claim_id}/mark-printed`

Mark Printed

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [ClaimOut](#claimout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/claims/{claim_id}/cancel`

Cancel

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [ClaimOut](#claimout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/claims/{claim_id}/reuse-for-template`

Reuse For Template

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [ReuseRequest](#reuserequest)

Responses:

- `200` — [ReuseResponse](#reuseresponse)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/doctor/claims/{claim_id}`

Get Claim

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Responses:

- `200` — [ClaimOut](#claimout)
- `422` — [HTTPValidationError](#httpvalidationerror)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group claim-extensions

Claim-scoped extensions: intake source evidence and history permanent-delete.

### DELETE `/api/doctor/claims/{claim_id}`

Permanently delete a claim — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

> New permanent-delete operation, distinct from POST .../cancel; restricted to CANCELLED/DRAFT claims.

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Responses:

- `204` — Deleted.
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/doctor/claims/{claim_id}/intake-text`

Get the claim's intake source text — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Responses:

- `200` — [ClaimIntakeText](#claimintaketext)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group system

Service liveness.

### GET `/health`

Health

Auth: none

Responses:

- `200` — object of any
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group coverage-registry

Covered-vs-roadmap insurer/form registry driving form selection; coverage must never be overstated.

### GET `/api/doctor/coverage-registry`

List the coverage registry — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

> Kept as a distinct, richer operation (covered-vs-roadmap registry) - not a rename of GET /api/doctor/insurance-companies.

Auth: bearer / cookie

Responses:

- `200` — array of [CoverageInsurer](#coverageinsurer)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group document-inbox

Virtual-printer captures and future upload channels awaiting intake import.

### GET `/api/doctor/document-inbox`

List inbox documents — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — array of [InboxDocument](#inboxdocument)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/doctor/print-captures`

List virtual-printer captures — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — array of [InboxDocument](#inboxdocument)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/document-inbox/{document_id}/import`

Import a captured document into an intake — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `document_id` | string | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [InboxImportResult](#inboximportresult)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group staff-handoff

Staff-prepared claims handed to the doctor for review and sign-off.

### GET `/api/doctor/handoffs`

List staff hand-offs — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — array of [StaffHandoff](#staffhandoff)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/claims/{claim_id}/handoff`

Hand a prepared claim to the doctor — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [HandoffCreate](#handoffcreate)

Responses:

- `200` — [StaffHandoff](#staffhandoff)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/handoffs/{handoff_id}/accept`

Accept a hand-off — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `handoff_id` | string | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [StaffHandoff](#staffhandoff)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group doctor-settings

Doctor account settings; the produce step consumes the signature image.

### GET `/api/doctor/settings`

Get doctor settings — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — [DoctorSettings](#doctorsettings)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/doctor/settings`

Update doctor settings — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Request body: [DoctorSettingsUpdate](#doctorsettingsupdate)

Responses:

- `200` — [DoctorSettings](#doctorsettings)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group notifications

In-app notifications for the doctor surface.

### GET `/api/doctor/notifications`

List notifications — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

> Paged from day one (unbounded list; audit §2-3).

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no |  |
| `page_size` | integer | no |  |

Responses:

- `200` — [Page_NotificationItem_](#pagenotificationitem)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/notifications/{notification_id}/read`

Mark a notification read — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `notification_id` | string | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [NotificationItem](#notificationitem)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/notifications/read-all`

Mark all notifications read — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [SuccessResponse](#successresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group support-access

Doctor-side grant/revoke seam for operator impersonation; every grant/session emits an audit event.

### GET `/api/doctor/support-access`

Get support-access state — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — [SupportAccessState](#supportaccessstate)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/support-access/grant`

Grant support access — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [SupportAccessGrantRequest](#supportaccessgrantrequest)

Responses:

- `200` — [SupportAccessGrant](#supportaccessgrant)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/doctor/support-access/revoke`

Revoke support access — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [SupportAccessRevokeRequest](#supportaccessrevokerequest)

Responses:

- `200` — [SuccessResponse](#successresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group auth-flow

Target-auth journey behind the frontend auth-adapter seam (ADRs 0040/0041): MFA, recovery, account discovery, clinic selection, session state, re-auth deep links.

### POST `/api/auth/mfa/challenge`

Begin an MFA challenge — **Backend status: FUTURE-AUTH** (forward contract — not yet implemented by the backend)

Auth: none

Responses:

- `200` — [MfaChallenge](#mfachallenge)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/auth/mfa/verify`

Verify an MFA challenge — **Backend status: FUTURE-AUTH** (forward contract — not yet implemented by the backend)

Auth: none

Request body: [MfaVerifyRequest](#mfaverifyrequest)

Responses:

- `200` — [LoginResponse](#loginresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/auth/mfa/verify-backup-code`

Verify MFA with a one-time backup recovery code — **Backend status: implemented** (forward contract — not yet implemented by the backend)

Auth: none

Request body: [MfaBackupCodeVerifyRequest](#mfabackupcodeverifyrequest)

Responses:

- `200` — [LoginResponse](#loginresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/auth/recovery/start`

Start deliberate account recovery — **Backend status: FUTURE-AUTH** (forward contract — not yet implemented by the backend)

Auth: none

Request body: [RecoveryStartRequest](#recoverystartrequest)

Responses:

- `200` — [SuccessResponse](#successresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/auth/clinics`

List the clinics this identity can enter — **Backend status: FUTURE-AUTH** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — [AuthClinicList](#authcliniclist)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/auth/clinics/select`

Select a clinic for this session — **Backend status: FUTURE-AUTH** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Request body: [ClinicSelectRequest](#clinicselectrequest)

Responses:

- `200` — [ClinicSelectResponse](#clinicselectresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/auth/session`

Get session state — **Backend status: FUTURE-AUTH** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — [SessionState](#sessionstate)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/auth/session/refresh`

Refresh the session — **Backend status: FUTURE-AUTH** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — [SessionState](#sessionstate)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/auth/session/deep-link`

Issue a re-auth deep-link token — **Backend status: FUTURE-AUTH** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Request body: [DeepLinkTokenRequest](#deeplinktokenrequest)

Responses:

- `200` — [DeepLinkToken](#deeplinktoken)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/auth/session/deep-link/redeem`

Redeem a re-auth deep-link token — **Backend status: FUTURE-AUTH** (forward contract — not yet implemented by the backend)

Auth: none

Request body: [DeepLinkRedeemRequest](#deeplinkredeemrequest)

Responses:

- `200` — [DeepLinkRedeemResponse](#deeplinkredeemresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin-tickets

Operations tickets and the clinic onboarding queue.

### GET `/api/admin/tickets`

List tickets — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no |  |
| `page_size` | integer | no |  |
| `status` | string | no |  |
| `owner` | string | no |  |

Responses:

- `200` — [Page_Ticket_](#pageticket)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/tickets/{ticket_id}`

Get a ticket — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `ticket_id` | string | yes |  |

Responses:

- `200` — [Ticket](#ticket)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/tickets/{ticket_id}`

Update a ticket — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `ticket_id` | string | yes |  |

Request body: [TicketUpdate](#ticketupdate)

Responses:

- `200` — [Ticket](#ticket)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/tickets/{ticket_id}/resolve`

Resolve a ticket — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `ticket_id` | string | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [TicketResolveRequest](#ticketresolverequest)

Responses:

- `200` — [Ticket](#ticket)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/onboarding-queue`

List the clinic onboarding queue — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — array of [OnboardingQueueItem](#onboardingqueueitem)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin-tags

Form-tag taxonomy and the per-doctor visibility matrix.

### GET `/api/admin/tags`

List tags — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `kind` | string | no |  |

Responses:

- `200` — array of [Tag](#tag)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/tags`

Create a tag — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [TagCreate](#tagcreate)

Responses:

- `200` — [Tag](#tag)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/tags/{tag_id}`

Update a tag — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `tag_id` | integer | yes |  |

Request body: [TagUpdate](#tagupdate)

Responses:

- `200` — [Tag](#tag)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/tags/{tag_id}/retire`

Retire a tag (re-mapping members) — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `tag_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [TagRetireRequest](#tagretirerequest)

Responses:

- `200` — [TagRetireResult](#tagretireresult)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/tags/visibility`

Get the per-doctor tag-visibility matrix — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | no |  |

Responses:

- `200` — array of [TagVisibilityEntry](#tagvisibilityentry)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/tags/visibility`

Replace tag-visibility entries — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Request body: [TagVisibilitySet](#tagvisibilityset)

Responses:

- `200` — [SuccessResponse](#successresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin-analytics

Console analytics aggregates; exports are surrogate-only and audit-logged.

### GET `/api/admin/analytics/overview`

Analytics overview — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — [AnalyticsOverview](#analyticsoverview)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/analytics/usage`

Usage series — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `range_days` | integer | no |  |
| `clinic_id` | integer | no |  |
| `doctor_id` | integer | no |  |

Responses:

- `200` — array of [UsagePoint](#usagepoint)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/analytics/funnel`

Activation funnel — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — [ActivationFunnel](#activationfunnel)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/analytics/verification`

Verification report — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — [VerificationReport](#verificationreport)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/analytics/quality`

Quality report — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — [QualityReport](#qualityreport)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/analytics/export`

Export an analytics report — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [AnalyticsExportRequest](#analyticsexportrequest)

Responses:

- `200` — [AnalyticsExportResult](#analyticsexportresult)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin-impersonation

Operator-side impersonation sessions; server-rendered and fail-safe in production.

### GET `/api/admin/impersonation/session`

Get the active impersonation session — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Responses:

- `200` — [ImpersonationSessionState](#impersonationsessionstate)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/impersonation/start`

Start an impersonation session — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

> Start/end/abandon emit audit events.

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [ImpersonationStartRequest](#impersonationstartrequest)

Responses:

- `200` — [ImpersonationSession](#impersonationsession)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/impersonation/end`

End the impersonation session — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [SuccessResponse](#successresponse)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin-claims-oversight

Admin-scoped claims oversight (cross-clinic, PHI-redacted): the console must not ride doctor-scoped routes an admin token cannot call.

### GET `/api/admin/claims`

List claims across clinics (PHI-redacted) — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

> patient_name is null at portfolio level; final_field_values are returned for client-side masked reveal.

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no |  |
| `page_size` | integer | no |  |
| `clinic_id` | integer | no |  |
| `status` | string | no |  |
| `date_from` | string | no |  |
| `date_to` | string | no |  |

Responses:

- `200` — [Page_ClaimListItem_](#pageclaimlistitem)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/claims/{claim_id}`

Get one claim (PHI-redacted) — **Backend status: DRIFT** (forward contract — not yet implemented by the backend)

> patient_name and ai_raw_result redacted; final_field_values returned for client-side masked reveal.

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `claim_id` | integer | yes |  |

Responses:

- `200` — [ClaimOut](#claimout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group account-management

ADR 0041 account-clinic management: link/unlink/switch, account-model fields, login-issue tooling, clinic notes.

### POST `/api/admin/doctors/{doctor_id}/clinics`

Link a clinic to a doctor account — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Request body: [DoctorClinicLink](#doctorcliniclink)

Responses:

- `200` — [DoctorAccountOut](#doctoraccountout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PUT `/api/admin/doctors/{doctor_id}/clinics`

Replace the doctor's linked-clinic set (atomic switch) — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

> Closes the ADR 0041 decision-2 switch gap with set-collection semantics, mirroring PUT /api/admin/clinics/{clinic_id}/insurance-companies.

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Request body: [DoctorClinicsSet](#doctorclinicsset)

Responses:

- `200` — [DoctorAccountOut](#doctoraccountout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### DELETE `/api/admin/doctors/{doctor_id}/clinics/{clinic_id}`

Unlink a clinic from a doctor account — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |
| `clinic_id` | integer | yes |  |

Responses:

- `200` — [DoctorAccountOut](#doctoraccountout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/doctors/{doctor_id}/account-model`

Update account-model fields — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Request body: [DoctorAccountModelUpdate](#doctoraccountmodelupdate)

Responses:

- `200` — [DoctorAccountOut](#doctoraccountout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/doctors/{doctor_id}/reset-mfa`

Reset the doctor's MFA enrolment — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [DoctorAccountOut](#doctoraccountout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/doctors/{doctor_id}/unlock`

Clear a failed-attempt / rate-limit lock — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |

Header parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `Idempotency-Key` | string | no | Reserved. Not enforced in Phase 1; clients may send a unique key per logical mutation so later server-side enforcement is non-breaking. |

Responses:

- `200` — [DoctorAccountOut](#doctoraccountout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### PATCH `/api/admin/clinics/{clinic_id}/notes`

Update the clinic's operator notes — **Backend status: MISSING** (forward contract — not yet implemented by the backend)

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

Request body: [ClinicNotesUpdate](#clinicnotesupdate)

Responses:

- `200` — [ClinicAccountOut](#clinicaccountout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Group admin:audit

Unified operator audit trail (append-only, PHI-safe).

### GET `/api/admin/audit-logs`

List Audit Logs

Auth: bearer / cookie

Query parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `page` | integer | no |  |
| `page_size` | integer | no |  |
| `scope` | `"global"` \| `"clinic"` | no |  |
| `operator_id` | integer | no |  |
| `action_type` | string | no |  |
| `clinic_id` | integer | no |  |

Responses:

- `200` — [Page_AuditLogOut_](#pageauditlogout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### POST `/api/admin/audit-logs`

Create Audit Log

Client-driven audit write. PHI in field_set/detail is rejected server-side.

Auth: bearer / cookie

Request body: [AuditLogCreate](#auditlogcreate)

Responses:

- `200` — [AuditLogOut](#auditlogout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

### GET `/api/admin/audit-logs/{event_code}`

Get Audit Log

Auth: bearer / cookie

Path parameters:

| Name | Type | Required | Notes |
|---|---|---|---|
| `event_code` | string | yes |  |

Responses:

- `200` — [AuditLogOut](#auditlogout)
- errors — [ErrorEnvelope](#errorenvelope) (domain failures) / [HTTPValidationError](#httpvalidationerror) (native 422 request-shape validation)

## Schemas

### Body_replace_template_file_api_admin_templates__template_id__file_put

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | string | yes |  |

### Body_upload_logo_api_admin_insurance_companies_logo_post

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | string | yes |  |

### Body_upload_template_api_admin_templates_post

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |
| `template_name` | string | yes |  |
| `file` | string | yes |  |

### ClaimCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |
| `template_id` | integer | yes |  |

### ClaimListItem

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `submission_no` | string | yes |  |
| `patient_name` | string \| null | yes |  |
| `patient_name_cn` | string \| null | no |  |
| `patient_name_en` | string \| null | no |  |
| `company_id` | integer | yes |  |
| `template_id` | integer | yes |  |
| `status` | [ClaimStatus](#claimstatus) | yes |  |
| `created_at` | string (date-time) | yes |  |
| `generated_pdf_url` | string \| null | no |  |
| `company_name` | string \| null | no |  |
| `company_name_en` | string \| null | no |  |
| `template_name` | string \| null | no |  |
| `clinic_id` | integer | no | Clinic attribution for merged-workspace listings (backend ask, ADR 0041). |
| `clinic_name` | string \| null | no |  |

### ClaimOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `submission_no` | string | yes |  |
| `clinic_id` | integer | yes |  |
| `doctor_id` | integer | yes |  |
| `company_id` | integer | yes |  |
| `template_id` | integer | yes |  |
| `template_version` | string \| null | yes |  |
| `patient_name` | string \| null | yes |  |
| `patient_name_cn` | string \| null | no |  |
| `patient_name_en` | string \| null | no |  |
| `ai_raw_result` | object of any \| null | yes |  |
| `final_field_values` | object of any \| null | yes |  |
| `ai_token_usage` | integer \| null | yes |  |
| `ai_process_time_ms` | integer \| null | yes |  |
| `generated_pdf_url` | string \| null | yes | Opaque URL string. Production values are short-lived presigned URLs (patient document class - never durable public URLs). |
| `status` | [ClaimStatus](#claimstatus) | yes |  |
| `created_at` | string (date-time) | yes |  |

### ClinicConfigOverview

| Field | Type | Required | Notes |
|---|---|---|---|
| `companies` | array of [CompanyConfigItem](#companyconfigitem) | yes |  |

### ClinicCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_name` | string | yes |  |
| `clinic_name_en` | string \| null | no |  |
| `clinic_code` | string \| null | no |  |
| `address` | string \| null | no |  |
| `phone` | string \| null | no |  |
| `chop_image_url` | string \| null | no | Opaque URL string. Production values are signed or public asset URLs (branding/asset class - long TTL acceptable). |
| `district_id` | integer \| null | no | FK to districts.id — select from the districts dictionary; free-text district is not accepted. |
| `data_region` | `"香港"` \| `"新加坡"` \| `"美国"` \| null | no | Clinic data residency: 香港 / 新加坡 / 美国. |

### ClinicInsuranceUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_ids` | array of integer | yes |  |

### ClinicOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `clinic_code` | string | yes |  |
| `clinic_name` | string | yes |  |
| `clinic_name_en` | string \| null | yes |  |
| `address` | string \| null | yes |  |
| `phone` | string \| null | yes |  |
| `chop_image_url` | string \| null | yes | Opaque URL string. Production values are signed or public asset URLs (branding/asset class - long TTL acceptable). |
| `status` | integer | yes | Organisation-entity status: 0 = disabled, 1 = enabled. |
| `idle_lock_minutes` | integer | yes | Clinic default idle screen lock threshold (minutes, 2–30). |
| `district_id` | integer \| null | no |  |
| `district_name_zh` | string \| null | no | Joined from districts.name_zh for list/detail display. |
| `district_name_en` | string \| null | no | Joined from districts.name_en for list/detail display. |
| `created_at` | string (date-time) | yes |  |
| `data_region` | string | yes | Clinic data residency: 香港 / 新加坡 / 美国. |
| `is_flagged` | integer | yes | 1 = needs attention (operator flag), 0 = not flagged. |
| `lifecycle_status` | string | yes | Operational lifecycle: provisioning \| onboarding \| active. Needs-attention is is_flagged, not a lifecycle value. |
| `subscription_status` | string | no | Joined from clinic_subscriptions.subscription_status (1:1). |
| `payment_status` | string | no | Joined from clinic_subscriptions.payment_status (1:1). |
| `plan_code` | string | no | Joined from clinic_subscriptions.plan_code (1:1). |

### ClinicStatusUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | integer | yes |  |

### ClinicTemplatesSet

| Field | Type | Required | Notes |
|---|---|---|---|
| `template_ids` | array of integer | yes |  |

### ClinicTemplatesSetResult

| Field | Type | Required | Notes |
|---|---|---|---|
| `enabled_template_ids` | array of integer | yes |  |

### ClinicUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_name` | string \| null | no |  |
| `clinic_name_en` | string \| null | no |  |
| `address` | string \| null | no |  |
| `phone` | string \| null | no |  |
| `chop_image_url` | string \| null | no | Opaque URL string. Production values are signed or public asset URLs (branding/asset class - long TTL acceptable). |
| `idle_lock_minutes` | integer | no | Clinic default idle screen lock threshold (minutes, 2–30). |
| `district_id` | integer \| null | no | FK to districts.id — select from the districts dictionary; free-text district is not accepted. |
| `data_region` | `"香港"` \| `"新加坡"` \| `"美国"` \| null | no | Clinic data residency: 香港 / 新加坡 / 美国. |

### CompanyBrief

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `company_name` | string | yes |  |
| `company_name_en` | string \| null | yes |  |
| `logo_url` | string \| null | yes |  |

### CompanyConfigItem

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |
| `company_name` | string | yes |  |
| `enabled` | boolean | yes |  |
| `template_count` | integer | yes |  |
| `enabled_template_count` | integer | yes |  |
| `templates` | array of [TemplateConfigItem](#templateconfigitem) | yes |  |

### CompanyCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_name` | string | yes |  |
| `company_name_en` | string \| null | no |  |
| `company_code` | string \| null | no |  |
| `logo_url` | string \| null | no | Opaque URL string. Production values are signed or public asset URLs (branding/asset class - long TTL acceptable). |
| `contact_info` | string \| null | no |  |

### CompanyEnableResult

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |
| `enabled` | boolean | yes |  |

### CompanyEnableUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `enabled` | boolean | yes |  |

### CompanyOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `company_code` | string | yes |  |
| `company_name` | string | yes |  |
| `company_name_en` | string \| null | yes |  |
| `logo_url` | string \| null | yes | Opaque URL string. Production values are signed or public asset URLs (branding/asset class - long TTL acceptable). |
| `contact_info` | string \| null | yes |  |
| `status` | integer | yes | Organisation-entity status: 0 = disabled, 1 = enabled. |
| `created_at` | string (date-time) | yes |  |

### CompanyStatusUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | integer | yes |  |

### CompanyUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_name` | string \| null | no |  |
| `company_name_en` | string \| null | no |  |
| `logo_url` | string \| null | no | Opaque URL string. Production values are signed or public asset URLs (branding/asset class - long TTL acceptable). |
| `contact_info` | string \| null | no |  |
| `status` | integer \| null | no | **Deprecated.** Deprecated: use PATCH .../status. Kept for compatibility; servers keep accepting it. |

### DoctorCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |
| `doctor_name` | string | yes |  |
| `doctor_name_en` | string \| null | no |  |
| `reg_no` | string \| null | no |  |
| `email` | string \| null | no |  |
| `login_account` | string | yes |  |
| `password` | string | yes |  |
| `signature_url` | string \| null | no | Opaque URL string. Production values are signed or public asset URLs (branding/asset class - long TTL acceptable). |
| `specialty_tag_id` | integer \| null | no | 专科标签 ID（form_tag.kind=specialty）；省略时默认为全科。 |

### DoctorOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `clinic_id` | integer \| null | yes |  |
| `doctor_name` | string | yes |  |
| `doctor_name_en` | string \| null | yes |  |
| `reg_no` | string \| null | yes |  |
| `email` | string \| null | yes |  |
| `signature_url` | string \| null | yes | Opaque URL string. Production values are signed or public asset URLs (branding/asset class - long TTL acceptable). |
| `login_account` | string | yes |  |
| `status` | integer | yes | Organisation-entity status: 0 = disabled, 1 = enabled. |
| `created_at` | string (date-time) | yes |  |
| `workspace_mode` | string | yes |  |
| `account_notes` | string \| null | no |  |
| `account_notes_format` | `"markdown"` \| `"html"` | yes |  |
| `specialty_tag_id` | integer | yes |  |
| `specialty_label_en` | string | yes |  |
| `specialty_label_zh` | string | yes |  |

### DoctorStatusUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | integer | yes |  |

### DoctorUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `doctor_name` | string \| null | no |  |
| `doctor_name_en` | string \| null | no |  |
| `reg_no` | string \| null | no |  |
| `email` | string \| null | no |  |
| `login_account` | string \| null | no |  |
| `signature_url` | string \| null | no | Opaque URL string. Production values are signed or public asset URLs (branding/asset class - long TTL acceptable). |
| `status` | integer \| null | no | **Deprecated.** Deprecated: use PATCH .../status. Kept for compatibility; servers keep accepting it. |
| `specialty_tag_id` | integer \| null | no |  |

### DomainCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `domain_code` | string | yes |  |
| `domain_name` | string | yes |  |
| `sort_order` | integer | no | Default: `0`. |
| `remark` | string \| null | no |  |

### DomainOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `domain_code` | string | yes |  |
| `domain_name` | string | yes |  |
| `sort_order` | integer | yes |  |
| `remark` | string \| null | yes |  |

### DraftSave

| Field | Type | Required | Notes |
|---|---|---|---|
| `patient_name` | string \| null | no |  |
| `medical_record_text` | string \| null | no |  |

### DraftSaveResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `saved_at` | string (date-time) | yes |  |

### ExtractRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `medical_record_text` | string | yes |  |
| `template_id` | integer | yes |  |

### ExtractResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `extracted_fields` | object of [ExtractedField](#extractedfield) | yes |  |
| `process_time_ms` | integer | yes |  |
| `token_usage` | integer | yes |  |

### ExtractedField

| Field | Type | Required | Notes |
|---|---|---|---|
| `value` | string \| null | yes |  |
| `confidence` | number | yes |  |

### FieldIgnoreSave

| Field | Type | Required | Notes |
|---|---|---|---|
| `row_version` | integer | yes |  |
| `reason` | string \| null | no |  |

### FieldMappingOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `standard_field_id` | integer \| null | yes |  |
| `transform_rule_id` | integer \| null | yes |  |
| `fixed_value` | string \| null | yes |  |
| `checkbox_map_value` | string \| null | yes |  |
| `template_specific_field_code` | string \| null | yes |  |
| `template_specific_ai_hint` | string \| null | yes |  |

### FieldMappingSave

| Field | Type | Required | Notes |
|---|---|---|---|
| `standard_field_id` | integer \| null | no |  |
| `fixed_value` | string \| null | no |  |
| `checkbox_map_value` | string \| null | no |  |
| `transform_rule_id` | integer \| null | no |  |
| `template_specific_field_code` | string \| null | no |  |
| `template_specific_ai_hint` | string \| null | no |  |
| `confirm` | boolean | no | Default: `false`. |

### FieldRestoreSave

| Field | Type | Required | Notes |
|---|---|---|---|
| `row_version` | integer | yes |  |

### FieldsUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `final_field_values` | object of string \| null | yes |  |
| `confirmed` | object of boolean | no | Per-field confirmation set keyed by field code (backend ask, x-backend-status DRIFT: confirmation state has no home in the implemented contract). |
| `row_version` | integer | no | Optimistic-lock cursor for the claim (backend ask: claims currently have no row_version; stale writes should return 409 CONFLICT once implemented). |

### GeneratePdfResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `pdf_url` | string | yes | Opaque URL string. Production values are short-lived presigned URLs (patient document class - never durable public URLs). |
| `generated_at` | string | yes |  |

### HTTPValidationError

| Field | Type | Required | Notes |
|---|---|---|---|
| `detail` | array of [ValidationError](#validationerror) | no |  |

### HomeOverview

| Field | Type | Required | Notes |
|---|---|---|---|
| `greeting_name` | string | yes |  |
| `clinic_name` | string | yes |  |
| `stats` | [HomeStats](#homestats) | yes |  |
| `unfinished_drafts` | array of [UnfinishedDraft](#unfinisheddraft) | yes |  |
| `quick_start_shortcuts` | array of [QuickStartShortcut](#quickstartshortcut) | yes |  |
| `recent_claims` | array of [RecentClaimItem](#recentclaimitem) | yes |  |

### HomeStats

| Field | Type | Required | Notes |
|---|---|---|---|
| `today_count` | integer | yes |  |
| `pending_draft_count` | integer | yes |  |
| `month_total_count` | integer | yes |  |

### LoginRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | yes |  |
| `password` | string | yes |  |

### LoginResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `access_token` | string \| null | no |  |
| `token_type` | string | no | Default: `"bearer"`. |
| `role` | [UserRole](#userrole) | yes |  |
| `user_id` | integer | yes |  |
| `clinic_id` | integer \| null | no |  |
| `display_name` | string \| null | no |  |
| `mfa_enabled` | boolean | no | Account MFA opt-in (ADR 0040; backend ask pending the account model). |
| `mfa_required` | boolean | no | True when password OK but MFA step-up is required (doctors only). |
| `mfa_token` | string \| null | no | Short-lived token for POST /auth/mfa/verify when mfa_required is true. |
| `merged_workspace` | boolean | no | True when a multi-clinic identity enters one combined workspace (ADR 0041 §6; backend ask). |

### LogoUploadResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `url` | string | yes | Opaque URL string. Production values are signed or public asset URLs (branding/asset class - long TTL acceptable). |

### MeResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `user_id` | integer | yes |  |
| `role` | [UserRole](#userrole) | yes |  |
| `clinic_id` | integer \| null | no |  |
| `display_name` | string \| null | no |  |
| `mfa_enabled` | boolean | no | Account MFA opt-in (ADR 0040; backend ask pending the account model). |
| `merged_workspace` | boolean | no | True when a multi-clinic identity enters one combined workspace (ADR 0041 §6; backend ask). |
| `username` | string \| null | no | Login account (admin username or doctor login_account). |

### MedicalRecordSubmit

| Field | Type | Required | Notes |
|---|---|---|---|
| `medical_record_text` | string | yes |  |
| `patient_name` | string \| null | no |  |

### MissingRequiredFieldOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `field_code` | string | yes |  |
| `field_name` | string | yes |  |

### Page_ClaimListItem_

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of [ClaimListItem](#claimlistitem) | yes |  |
| `total` | integer | yes |  |
| `page` | integer | yes |  |
| `page_size` | integer | yes |  |

### Page_ClinicOut_

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of [ClinicOut](#clinicout) | yes |  |
| `total` | integer | yes |  |
| `page` | integer | yes |  |
| `page_size` | integer | yes |  |

### Page_CompanyOut_

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of [CompanyOut](#companyout) | yes |  |
| `total` | integer | yes |  |
| `page` | integer | yes |  |
| `page_size` | integer | yes |  |

### Page_DoctorOut_

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of [DoctorOut](#doctorout) | yes |  |
| `total` | integer | yes |  |
| `page` | integer | yes |  |
| `page_size` | integer | yes |  |

### ParseProgressOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `percent` | integer | yes |  |
| `message` | string \| null | no |  |
| `status` | [TemplateParseStatus](#templateparsestatus) \| null | no |  |

### PreviewFillRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `sample_values` | object of string | yes |  |

### PreviewFillResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `preview_pdf_url` | string | yes | Opaque URL string. Production values are short-lived presigned URLs (patient document class - never durable public URLs). |

### PublishPreviewOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `total_count` | integer | yes |  |
| `processed_count` | integer | yes |  |
| `pending_count` | integer | yes |  |
| `missing_required` | array of [MissingRequiredFieldOut](#missingrequiredfieldout) | yes |  |

### QuickStartShortcut

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |
| `company_name` | string | yes |  |
| `template_id` | integer | yes |  |
| `template_name` | string | yes |  |

### RecentClaimItem

| Field | Type | Required | Notes |
|---|---|---|---|
| `submission_id` | integer | yes | Historical field name for the claim id. Existing fields keep this name; new operations use `id`/`claim_id`. |
| `patient_name` | string \| null | yes |  |
| `company_name` | string | yes |  |
| `status` | [ClaimStatus](#claimstatus) | yes |  |
| `status_label` | string | yes |  |
| `created_at` | string (date-time) | yes |  |

### ReparseResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `parse_status` | [TemplateParseStatus](#templateparsestatus) | yes |  |
| `parse_job_id` | string \| null | no |  |

### ResetPasswordResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `temp_password` | string | yes |  |

### ReuseRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `new_template_id` | integer | yes |  |

### ReuseResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `submission_id` | integer | yes | Historical field name for the claim id. Existing fields keep this name; new operations use `id`/`claim_id`. |
| `prefilled_fields` | object of string \| null | yes |  |
| `missing_fields` | array of string | yes |  |

### StandardFieldCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `field_code` | string | yes |  |
| `field_name` | string | yes |  |
| `field_name_en` | string \| null | no |  |
| `domain_id` | integer | yes |  |
| `data_type` | [FieldDataType](#fielddatatype) | yes |  |
| `enum_options` | array of string \| null | no |  |
| `is_required` | boolean | no | Default: `false`. |
| `source_type` | [FieldSourceType](#fieldsourcetype) | no | Default: `"AI"`. |
| `ai_extraction_hint` | string \| null | no |  |
| `validation_rule` | string \| null | no |  |
| `example_value` | string \| null | no |  |

### StandardFieldOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `field_code` | string | yes |  |
| `field_name` | string | yes |  |
| `field_name_en` | string \| null | yes |  |
| `domain_id` | integer | yes |  |
| `data_type` | [FieldDataType](#fielddatatype) | yes |  |
| `enum_options` | array of string \| null | yes |  |
| `is_required` | boolean | yes |  |
| `source_type` | [FieldSourceType](#fieldsourcetype) | yes |  |
| `ai_extraction_hint` | string \| null | yes |  |
| `validation_rule` | string \| null | yes |  |
| `example_value` | string \| null | yes |  |
| `is_active` | boolean | yes |  |
| `created_at` | string (date-time) | yes |  |

### StandardFieldUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `field_name` | string \| null | no |  |
| `field_name_en` | string \| null | no |  |
| `domain_id` | integer \| null | no |  |
| `data_type` | [FieldDataType](#fielddatatype) \| null | no |  |
| `enum_options` | array of string \| null | no |  |
| `is_required` | boolean \| null | no |  |
| `source_type` | [FieldSourceType](#fieldsourcetype) \| null | no |  |
| `ai_extraction_hint` | string \| null | no |  |
| `validation_rule` | string \| null | no |  |
| `example_value` | string \| null | no |  |
| `is_active` | boolean \| null | no |  |

### TemplateBrief

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `template_name` | string | yes |  |
| `version` | string | yes |  |
| `page_count` | integer | yes |  |

### TemplateConfigItem

| Field | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |
| `template_name` | string | yes |  |
| `version` | string | yes |  |
| `parse_status` | string | yes |  |
| `is_active` | boolean | yes |  |
| `enabled` | boolean | yes |  |
| `updated_at` | string (date-time) \| null | no |  |

### TemplateEnableResult

| Field | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |
| `enabled` | boolean | yes |  |

### TemplateEnableUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `enabled` | boolean | yes |  |

### TemplateFieldCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `page_no` | integer | no | Default: `1`. |
| `field_label_raw` | string \| null | no |  |
| `field_type` | [TemplateFieldType](#templatefieldtype) | no | Default: `"text"`. |
| `pos_x` | number | yes |  |
| `pos_y` | number | yes |  |
| `width` | number | yes |  |
| `height` | number | yes |  |
| `font_size` | number | no | Default: `10`. |

### TemplateFieldOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `template_id` | integer | yes |  |
| `page_no` | integer | yes |  |
| `field_label_raw` | string \| null | yes |  |
| `pdf_field_name` | string \| null | yes |  |
| `field_type` | [TemplateFieldType](#templatefieldtype) | yes |  |
| `pos_x` | number | yes |  |
| `pos_y` | number | yes |  |
| `width` | number | yes |  |
| `height` | number | yes |  |
| `font_size` | number | yes |  |
| `recognize_source` | [RecognizeSource](#recognizesource) | yes |  |
| `confidence_score` | number \| null | yes |  |
| `is_confirmed` | boolean | yes |  |
| `field_status` | [TemplateFieldStatus](#templatefieldstatus) | yes |  |
| `ignore_reason` | string \| null | no |  |
| `row_version` | integer | yes |  |
| `mapping` | [FieldMappingOut](#fieldmappingout) \| null | no |  |

### TemplateFieldUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `row_version` | integer | yes |  |
| `page_no` | integer \| null | no |  |
| `field_label_raw` | string \| null | no |  |
| `field_type` | [TemplateFieldType](#templatefieldtype) \| null | no |  |
| `pos_x` | number \| null | no |  |
| `pos_y` | number \| null | no |  |
| `width` | number \| null | no |  |
| `height` | number \| null | no |  |
| `font_size` | number \| null | no |  |
| `is_confirmed` | boolean \| null | no |  |

### TemplateFileReplaceResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `parse_status` | [TemplateParseStatus](#templateparsestatus) | yes |  |

### TemplateOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `company_id` | integer | yes |  |
| `template_name` | string | yes |  |
| `template_code` | string | yes |  |
| `version` | string | yes |  |
| `original_pdf_url` | string | yes | Opaque URL string. Production values are signed URLs (internal form-template class). |
| `page_count` | integer | yes |  |
| `page_width` | number \| null | yes |  |
| `page_height` | number \| null | yes |  |
| `parse_status` | [TemplateParseStatus](#templateparsestatus) | yes |  |
| `parse_progress` | integer | no | Default: `0`. |
| `parse_message` | string \| null | no |  |
| `parse_error` | string \| null | no |  |
| `is_active` | boolean | yes |  |
| `created_at` | string (date-time) | yes |  |

### TemplateUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `template_name` | string \| null | no |  |
| `company_id` | integer \| null | no |  |

### TemplateUploadResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `parse_status` | [TemplateParseStatus](#templateparsestatus) | yes |  |

### TransformRuleCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `rule_code` | string | yes |  |
| `rule_name` | string | yes |  |
| `rule_type` | [TransformRuleType](#transformruletype) | yes |  |
| `rule_config` | object of any \| null | no |  |
| `remark` | string \| null | no |  |

### TransformRuleOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `rule_code` | string | yes |  |
| `rule_name` | string | yes |  |
| `rule_type` | [TransformRuleType](#transformruletype) | yes |  |
| `rule_config` | object of any \| null | yes |  |
| `remark` | string \| null | yes |  |

### UnfinishedDraft

| Field | Type | Required | Notes |
|---|---|---|---|
| `submission_id` | integer | yes | Historical field name for the claim id. Existing fields keep this name; new operations use `id`/`claim_id`. |
| `patient_name` | string \| null | yes |  |
| `company_name` | string | yes |  |
| `template_name` | string | yes |  |
| `status` | [ClaimStatus](#claimstatus) | yes |  |
| `status_label` | string | yes |  |
| `updated_at` | string (date-time) | yes |  |

### ValidationError

| Field | Type | Required | Notes |
|---|---|---|---|
| `loc` | array of string \| integer | yes |  |
| `msg` | string | yes |  |
| `type` | string | yes |  |
| `input` | any | no |  |
| `ctx` | object (Context) | no |  |

### SuccessResponse

Uniform acknowledgement body for actions with no resource payload.

| Field | Type | Required | Notes |
|---|---|---|---|
| `success` | boolean | yes |  |

### ErrorCode

Closed domain error-code list. Additions require a contract revision.

Enum: `APP_ERROR`, `VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `AI_UNAVAILABLE`

### ErrorEnvelope

Domain error envelope for every non-2xx failure except request-shape validation, which keeps FastAPI's native 422 HTTPValidationError shape.

| Field | Type | Required | Notes |
|---|---|---|---|
| `error` | object | yes |  |

### FieldMappingSaveResult

Saved mapping row id.

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |

### ClaimStatus

Claim state machine: DRAFT -> AI_FILLED -> CONFIRMED -> PRINTED; CANCELLED reachable from any state.

Enum: `DRAFT`, `AI_FILLED`, `CONFIRMED`, `PRINTED`, `CANCELLED`

### TemplateParseStatus

Template parse/publication lifecycle.

Enum: `PENDING`, `PARSING`, `AUTO_PARSED`, `AI_ASSISTED`, `ANNOTATED`, `PUBLISHED`, `PARSE_FAILED`

### TemplateFieldStatus

Template-field mapping lifecycle.

Enum: `PENDING`, `MAPPED`, `IGNORED`

### TemplateFieldType

Enum: `text`, `checkbox`, `radio`, `signature`, `image`, `date`

### RecognizeSource

How a template field was recognised.

Enum: `AUTO_PDF`, `AI_VISION`, `MANUAL`

### FieldDataType

Enum: `text`, `number`, `date`, `boolean`, `enum`, `table`, `image`, `signature`

### FieldSourceType

Where a standard field's value comes from.

Enum: `AI`, `SYSTEM`, `MANUAL`

### TransformRuleType

Enum: `DATE_FORMAT`, `CONCAT`, `SPLIT`, `ENUM_MAP`, `CUSTOM_SCRIPT`

### UserRole

Access is role-namespace based in Phase 1: the three admin roles are interchangeable for authorisation (sub-role separation is a backend follow-up); DOCTOR tokens carry clinic scope.

Enum: `SUPER_ADMIN`, `OPERATOR`, `ANNOTATOR`, `DOCTOR`

### WorkspaceSeparation

Multi-clinic workspace behaviour (ADR 0041 §6): `separated` picks a clinic per session; `merged` lands in one combined workspace.

Enum: `separated`, `merged`

### DoctorAccountOut

DoctorOut plus the ADR 0041 account model: all linked clinics (empty = individual account; `clinic_id` stays the primary link for compatibility), operator notes, workspace behaviour, MFA opt-in.

Extends [DoctorOut](#doctorout).

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_ids` | array of integer | yes |  |
| `notes` | string | yes | Operator-internal markdown notes - never doctor-visible. |
| `workspace_separation` | [WorkspaceSeparation](#workspaceseparation) | yes |  |
| `mfa_enabled` | boolean | yes |  |
| `notes_format` | `"markdown"` \| `"html"` | yes |  |

### ClinicAccountOut

ClinicOut plus the operator-notes account extension (ADR 0041).

Extends [ClinicOut](#clinicout).

| Field | Type | Required | Notes |
|---|---|---|---|
| `notes` | string | yes | Operator-internal markdown notes - never doctor-visible. |

### DoctorClinicLink

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

### DoctorClinicsSet

Atomic replacement of the doctor's linked-clinic set (covers switch without a bespoke verb; mirrors the clinic insurance-companies set-collection pattern).

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_ids` | array of integer | yes |  |

### DoctorAccountModelUpdate

Account-model fields outside the contract update body. Linking changes go through link/unlink/set, never this patch.

| Field | Type | Required | Notes |
|---|---|---|---|
| `notes` | string | no |  |
| `workspace_separation` | [WorkspaceSeparation](#workspaceseparation) | no |  |
| `mfa_enabled` | boolean | no |  |

### ClinicNotesUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `notes` | string | yes |  |

### MfaMethod

Enum: `totp`, `backup-code`, `hardware-key`

### MfaChallenge

| Field | Type | Required | Notes |
|---|---|---|---|
| `challenge_id` | string | yes |  |
| `methods` | array of [MfaMethod](#mfamethod) | yes |  |
| `expires_at` | string (date-time) | yes |  |

### MfaVerifyRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `challenge_id` | string | no |  |
| `method` | [MfaMethod](#mfamethod) | no |  |
| `code` | string | yes |  |
| `mfa_token` | string | no |  |

### MfaBackupCodeVerifyRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes |  |
| `mfa_token` | string | no |  |

### RecoveryStartRequest

Deliberate account recovery. Both fields optional: an authenticated session may omit both.

| Field | Type | Required | Notes |
|---|---|---|---|
| `login_account` | string | no |  |
| `channel` | `"email"` \| `"clinic-admin"` | no |  |

### AuthClinicOption

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `clinic_code` | string | yes |  |
| `name_zh` | string | yes |  |
| `name_en` | string | yes |  |

### AuthClinicList

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of [AuthClinicOption](#authclinicoption) | yes |  |
| `workspace_separation` | [WorkspaceSeparation](#workspaceseparation) | yes |  |

### ClinicSelectRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |

### ClinicSelectResponse

A fresh clinic-scoped session for the selected clinic.

Extends [LoginResponse](#loginresponse).

| Field | Type | Required | Notes |
|---|---|---|---|
| `success` | boolean | yes |  |

### SessionState

| Field | Type | Required | Notes |
|---|---|---|---|
| `authenticated` | boolean | yes |  |
| `user_id` | integer \| null | yes |  |
| `role` | [UserRole](#userrole) \| null | yes |  |
| `clinic_id` | integer \| null | yes |  |
| `display_name` | string \| null | yes |  |
| `mfa_verified` | boolean | yes |  |
| `merged_workspace` | boolean | yes | ADR 0041 §6 merged marker: the session spans every linked clinic. |
| `expires_at` | string (date-time) \| null | yes |  |

### DeepLinkTokenRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `return_target` | string | yes | Must be on the return-target allowlist (422 otherwise). |

### DeepLinkToken

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | yes |  |
| `return_target` | string | yes |  |
| `expires_at` | string (date-time) | yes |  |

### DeepLinkRedeemRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `token` | string | yes |  |

### DeepLinkRedeemResponse

| Field | Type | Required | Notes |
|---|---|---|---|
| `valid` | boolean | yes | Single-use: a second redeem of the same token returns false. |
| `return_target` | string \| null | yes |  |

### ClaimIntakeText

Intake source evidence for the review surface; PHI fetched minimally, on demand.

| Field | Type | Required | Notes |
|---|---|---|---|
| `intake_text` | string \| null | yes |  |
| `confirmed` | object of boolean | yes |  |
| `row_version` | integer | yes | Optimistic-lock cursor round-tripped into PUT .../fields. |

### InboxDocumentStatus

Enum: `new`, `imported`

### InboxDocument

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `filename` | string | yes |  |
| `captured_at` | string (date-time) | yes |  |
| `size_kb` | number | yes |  |
| `status` | [InboxDocumentStatus](#inboxdocumentstatus) | yes |  |

### InboxImportResult

| Field | Type | Required | Notes |
|---|---|---|---|
| `document_id` | string | yes |  |
| `intake_text` | string | yes |  |

### HandoffStatus

Enum: `pending`, `accepted`

### StaffHandoff

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `claim_id` | integer | yes |  |
| `prepared_by` | string | yes |  |
| `note_zh` | string | yes |  |
| `note_en` | string | yes |  |
| `created_at` | string (date-time) | yes |  |
| `status` | [HandoffStatus](#handoffstatus) | yes |  |

### HandoffCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `note_zh` | string | no |  |
| `note_en` | string | no |  |

### DeliveryDefault

Enum: `download`, `send`

### TrustedDevice

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `label` | string | yes |  |
| `last_seen_at` | string (date-time) | yes |  |

### DoctorSettings

| Field | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |
| `signature_image_url` | string \| null | yes |  |
| `language` | `"zh-Hant-HK"` \| `"en-HK"` | yes | Doctor preferred UI locale (persisted on doctor.language). |
| `idle_lock_minutes` | integer | yes | Resolved idle lock threshold in minutes (doctor override, else clinic default, else 10). |
| `delivery_default` | [DeliveryDefault](#deliverydefault) | yes |  |
| `trusted_devices` | array of [TrustedDevice](#trusteddevice) | yes |  |

### DoctorSettingsUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `signature_image_url` | string \| null | no |  |
| `language` | `"zh-Hant-HK"` \| `"en-HK"` | no | Doctor preferred UI locale (zh-Hant-HK \| en-HK). |
| `idle_lock_minutes` | integer | no | Personal idle lock override (2–30). Persisted on doctor.idle_lock_minutes. |
| `delivery_default` | [DeliveryDefault](#deliverydefault) | no |  |
| `remove_device_ids` | array of string | no |  |

### NotificationKind

Enum: `handoff`, `claim-ready`, `template`, `system`

### NotificationItem

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `kind` | [NotificationKind](#notificationkind) | yes |  |
| `title_zh` | string | yes |  |
| `title_en` | string | yes |  |
| `body_zh` | string | yes |  |
| `body_en` | string | yes |  |
| `claim_id` | integer \| null | yes |  |
| `created_at` | string (date-time) | yes |  |
| `read` | boolean | yes |  |

### ImpersonationMode

Enum: `view-as`, `act-as`

### SupportAccessGrant

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `operator` | string | yes |  |
| `mode` | [ImpersonationMode](#impersonationmode) | yes |  |
| `started_at` | string (date-time) | yes |  |
| `expires_at` | string (date-time) | yes |  |
| `status` | `"active"` \| `"expired"` \| `"revoked"` | yes |  |

### SupportAccessState

| Field | Type | Required | Notes |
|---|---|---|---|
| `active` | boolean | yes |  |
| `grants` | array of [SupportAccessGrant](#supportaccessgrant) | yes |  |

### SupportAccessGrantRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `mode` | [ImpersonationMode](#impersonationmode) | yes |  |
| `duration_minutes` | integer | no |  |

### SupportAccessRevokeRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `grant_id` | string | yes |  |

### CoverageStatus

Enum: `covered`, `roadmap`

### CoverageForm

| Field | Type | Required | Notes |
|---|---|---|---|
| `template_id` | integer | yes |  |
| `form_name_en` | string | yes |  |
| `form_name_zh` | string | yes |  |
| `page_count` | integer | yes |  |
| `coverage` | [CoverageStatus](#coveragestatus) | yes |  |

### CoverageInsurer

| Field | Type | Required | Notes |
|---|---|---|---|
| `company_id` | integer | yes |  |
| `company_name_en` | string | yes |  |
| `company_name_zh` | string | yes |  |
| `forms` | array of [CoverageForm](#coverageform) | yes |  |

### AuditActionClass

Known operator action classes. `AuditEvent.action` is an open string so servers can add classes without a contract break; clients treat unknown classes generically.

Enum: `impersonation-start`, `impersonation-end`, `impersonation-abandoned`, `act-as-edit`, `template-publish`, `template-archive`, `tag-change`, `bulk-operation`, `export`, `crm-edit`, `account-created`, `retention-override`

### AuditEvent

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `ts` | string (date-time) | yes |  |
| `operator` | string | yes |  |
| `action` | string | yes | Usually one of AuditActionClass; open for forward compatibility. |
| `target` | string | yes | Surrogate reference only - never PHI. |
| `mode` | [ImpersonationMode](#impersonationmode) \| null | yes |  |

### AuditEventCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `action` | string | yes |  |
| `target` | string | yes |  |
| `mode` | [ImpersonationMode](#impersonationmode) \| null | no |  |

### TicketStatus

Enum: `open`, `in-progress`, `resolved`

### Ticket

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `clinic_id` | integer | yes |  |
| `subject_zh` | string | yes |  |
| `subject_en` | string | yes |  |
| `status` | [TicketStatus](#ticketstatus) | yes |  |
| `owner` | string \| null | yes |  |
| `updated_at` | string (date-time) | yes |  |
| `notes` | array of string | yes |  |

### TicketUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `status` | [TicketStatus](#ticketstatus) | no |  |
| `owner` | string \| null | no |  |
| `add_note` | string | no |  |

### TicketResolveRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `resolution_note` | string \| null | no |  |

### OnboardingQueueItem

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |
| `next_step_zh` | string | yes |  |
| `next_step_en` | string | yes |  |
| `progress_step` | integer | yes |  |
| `progress_total` | integer | yes |  |
| `updated_at` | string (date-time) | yes |  |

### TagKind

Enum: `type`, `insurer`, `specialty`

### Tag

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `kind` | [TagKind](#tagkind) | yes |  |
| `label_zh` | string | yes |  |
| `label_en` | string | yes |  |
| `parent_id` | integer \| null | yes |  |
| `sort_order` | integer | yes |  |
| `retired` | boolean | yes |  |

### TagCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `kind` | [TagKind](#tagkind) | yes |  |
| `label_zh` | string | yes |  |
| `label_en` | string | yes |  |
| `parent_id` | integer \| null | no |  |
| `sort_order` | integer | no |  |

### TagUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `label_zh` | string | no |  |
| `label_en` | string | no |  |
| `parent_id` | integer \| null | no |  |
| `sort_order` | integer | no |  |

### TagRetireRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `remap_to_tag_id` | integer \| null | no |  |

### TagRetireResult

| Field | Type | Required | Notes |
|---|---|---|---|
| `tag` | [Tag](#tag) | yes |  |
| `remapped_count` | integer | yes |  |

### TagVisibilityEntry

| Field | Type | Required | Notes |
|---|---|---|---|
| `doctor_id` | integer | yes |  |
| `tag_id` | integer | yes |  |
| `visible` | boolean | yes |  |

### TagVisibilitySet

| Field | Type | Required | Notes |
|---|---|---|---|
| `entries` | array of [TagVisibilityEntry](#tagvisibilityentry) | yes |  |

### AnalyticsOverview

| Field | Type | Required | Notes |
|---|---|---|---|
| `forms_processed_today` | integer | yes |  |
| `forms_processed_7d` | integer | yes |  |
| `verify_pass_7d` | integer | yes |  |
| `verify_fail_7d` | integer | yes |  |
| `window_days` | integer | yes |  |

### UsagePoint

| Field | Type | Required | Notes |
|---|---|---|---|
| `date` | string (date) | yes |  |
| `count` | integer | yes |  |

### ActivationFunnel

| Field | Type | Required | Notes |
|---|---|---|---|
| `provisioning` | integer | yes |  |
| `onboarding` | integer | yes |  |
| `active` | integer | yes |  |

### VerificationReport

| Field | Type | Required | Notes |
|---|---|---|---|
| `pass` | integer | yes |  |
| `fail` | integer | yes |  |
| `window_days` | integer | yes |  |

### QualityTrendPoint

| Field | Type | Required | Notes |
|---|---|---|---|
| `date` | string (date) | yes |  |
| `avg_confidence` | number | yes |  |
| `correction_rate` | number | yes |  |

### QualityReport

| Field | Type | Required | Notes |
|---|---|---|---|
| `avg_confidence` | number | yes |  |
| `correction_rate` | number | yes |  |
| `trend` | array of [QualityTrendPoint](#qualitytrendpoint) | yes |  |

### AnalyticsExportRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `report` | `"usage"` \| `"funnel"` \| `"verification"` \| `"quality"` | yes |  |
| `range_days` | integer | no |  |

### AnalyticsExportResult

| Field | Type | Required | Notes |
|---|---|---|---|
| `export_url` | string | yes | Opaque URL string. Production values are short-lived presigned URLs (patient document class - never durable public URLs). Exports are surrogate-only and always emit an `export` audit event. |
| `logged_event_id` | string | yes |  |

### ImpersonationSession

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes |  |
| `clinic_id` | integer | yes |  |
| `doctor_id` | integer | yes |  |
| `operator` | string | yes |  |
| `mode` | [ImpersonationMode](#impersonationmode) | yes |  |
| `started_at` | string (date-time) | yes |  |
| `expires_at` | string (date-time) | yes |  |

### ImpersonationSessionState

| Field | Type | Required | Notes |
|---|---|---|---|
| `active` | [ImpersonationSession](#impersonationsession) \| null | yes |  |

### ImpersonationStartRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |
| `doctor_id` | integer | yes |  |
| `mode` | [ImpersonationMode](#impersonationmode) | yes |  |
| `duration_minutes` | integer | no |  |

### Page_AuditEvent_

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of [AuditEvent](#auditevent) | yes |  |
| `total` | integer | yes |  |
| `page` | integer | yes |  |
| `page_size` | integer | yes |  |

### Page_Ticket_

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of [Ticket](#ticket) | yes |  |
| `total` | integer | yes |  |
| `page` | integer | yes |  |
| `page_size` | integer | yes |  |

### Page_NotificationItem_

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of [NotificationItem](#notificationitem) | yes |  |
| `total` | integer | yes |  |
| `page` | integer | yes |  |
| `page_size` | integer | yes |  |

### ClinicFlagUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `is_flagged` | integer | yes | 0 = clear flag, 1 = mark needs attention. |

### ClinicSubscriptionOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |
| `subscription_status` | `"trial"` \| `"active"` \| `"cancelled"` \| `"expired"` | yes |  |
| `plan_code` | string | no |  |
| `price` | number | no |  |
| `currency` | string | yes | Default: `"HKD"`. |
| `payment_status` | `"unpaid"` \| `"paid"` \| `"overdue"` \| `"refunded"` | no |  |
| `payment_method` | `"bank_transfer"` \| `"credit_card"` \| `"cheque"` \| `"other"` | no |  |
| `note_content` | string | no |  |
| `note_format` | `"html"` \| `"markdown"` | yes | Default: `"markdown"`. |
| `note_updated_by` | integer | no |  |
| `note_updated_at` | string (date-time) | no |  |
| `updated_at` | string (date-time) | yes |  |

### ClinicSubscriptionUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `subscription_status` | `"trial"` \| `"active"` \| `"cancelled"` \| `"expired"` | no |  |
| `plan_code` | string | no |  |
| `price` | number | no |  |
| `currency` | string | no |  |
| `payment_status` | `"unpaid"` \| `"paid"` \| `"overdue"` \| `"refunded"` | no |  |
| `payment_method` | `"bank_transfer"` \| `"credit_card"` \| `"cheque"` \| `"other"` | no |  |

### ClinicSubscriptionNoteUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `note_content` | string | no |  |
| `note_format` | `"html"` \| `"markdown"` | no |  |

### ClinicRetentionOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_id` | integer | yes |  |
| `retention_days` | integer | yes |  |
| `is_overridden` | boolean | yes |  |
| `policy_name` | string | no |  |
| `overridden_at` | string (date-time) | no |  |
| `overridden_by` | integer | no |  |

### ClinicRetentionOverrideRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `clinic_code_input` | string | yes |  |
| `retention_days` | integer | yes |  |

### ClinicRetentionAuditOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `clinic_id` | integer | yes |  |
| `clinic_code_input` | string | yes |  |
| `old_retention_days` | integer | yes |  |
| `new_retention_days` | integer | yes |  |
| `operated_by` | integer | yes |  |
| `operator_name` | string | no |  |
| `operated_at` | string (date-time) | yes |  |
| `ip_address` | string | no |  |

### AuditActionType

Enum: `account_creation`, `simulation_start`, `simulation_end`, `simulation_interrupt`, `proxy_edit`, `retention_override`, `template_publish`, `template_archive`, `crm_billing_edit`, `tag_category_change`, `batch_operation`, `export`, `patient_data_view`, `clinic_activate`

### AuditLogOut

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | integer | yes |  |
| `event_code` | string | yes |  |
| `action_type` | [AuditActionType](#auditactiontype) | yes |  |
| `operator_id` | integer | yes |  |
| `operator_name` | string | no |  |
| `clinic_id` | integer | no |  |
| `target_ref` | string | no |  |
| `mode` | `"view-as"` \| `"act-as"` \| null | no |  |
| `field_set` | string | no |  |
| `detail` | object of any | no |  |
| `created_at` | string (date-time) | yes |  |

### AuditLogCreate

| Field | Type | Required | Notes |
|---|---|---|---|
| `action_type` | [AuditActionType](#auditactiontype) | yes |  |
| `clinic_id` | integer | no |  |
| `target_ref` | string | no |  |
| `mode` | `"view-as"` \| `"act-as"` \| null | no |  |
| `field_set` | string | no |  |
| `detail` | object of any | no |  |

### Page_AuditLogOut_

| Field | Type | Required | Notes |
|---|---|---|---|
| `items` | array of [AuditLogOut](#auditlogout) | yes |  |
| `total` | integer | yes |  |
| `page` | integer | yes |  |
| `page_size` | integer | yes |  |

### AccountNotesUpdate

| Field | Type | Required | Notes |
|---|---|---|---|
| `notes` | string | no | Default: `""`. |
| `notes_format` | `"markdown"` \| `"html"` \| null | no |  |

### ProfileUpdateRequest

| Field | Type | Required | Notes |
|---|---|---|---|
| `display_name` | string \| null | no |  |

