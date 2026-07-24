# API implementation notes

Companion to [`openapi.json`](../../packages/types/openapi.json) (the canonical contract) and
[`reference.md`](reference.md) (the generated reference). This document records every **intentional
decision** behind the contract: where it deviates from the implemented demo backend, where it
deliberately does not adopt the platform mandates of the engineering-hub API design, and what the
backend team is asked to build or change. Nothing here is accidental drift — anything not listed is
adopted from the implemented backend as-is.

Decision rule applied throughout: where the implemented backend and the frontend were equal, the
backend's convention wins; the frontend's choice survives only where it is materially better, and
each such case is noted below and on the operation (`x-implementation-note`).

## 1. Adopted backend conventions (contract-wide)

The contract is native to the implemented backend's dialect. These were explicit decisions, not
defaults:

| Area | Decision |
|---|---|
| Path structure | `/api/{doctor,admin}` role-prefixed paths, kebab-case resources, action-verb POSTs (`/confirm`, `/publish`). The role prefix does real authorisation work (one auth dependency per namespace). |
| Ids | Integer sequential ids in every path, body, and FK. Human-facing codes (`submission_no`, `clinic_code`, `template_code`) where a stable external identifier is needed. |
| Pagination | Offset `Page[T]` (`{items, total, page, page_size}`); `total` is load-bearing for the console grids. Bounded catalogue lists are deliberately non-paged bare arrays (marked in the spec); any list that can grow without bound is paged from day one (audit events, tickets, notifications, admin claims). |
| Error shape | `{"error": {code, message}}` with the closed SCREAMING_SNAKE `ErrorCode` enum, plus FastAPI's native 422 `{"detail": [...]}` for request-shape validation. Both shapes are normative; the client normalises both into one typed error. `request_id` added as an optional envelope field (cheap, forward-compatible with tracing). |
| Envelope | Bare payloads on success — no `data/meta` wrapper. Errors are discriminated by HTTP status plus the `error` key. |
| Field naming | snake_case end to end; `{entity}_name` descriptive prefixes. For NEW operations: use `id`/`claim_id` consistently — do not propagate the historical `submission_id` alias (existing response fields keep their shipped names, marked in the spec). |
| Status vocabularies | Two by rule: integer 0/1 on organisation entities (clinics, doctors, insurance companies, link rows); SCREAMING_SNAKE closed string state machines on workflow entities (claims, templates, template fields). New operations must not invent a third vocabulary. |
| Enums | All workflow enums declared **closed** in the spec (`ClaimStatus`, `TemplateParseStatus`, `TemplateFieldStatus`, `TemplateFieldType`, `RecognizeSource`, `FieldDataType`, `FieldSourceType`, `TransformRuleType`, `UserRole`, `ErrorCode`). The backend types most of these as bare strings today — tightening is schema-side only, zero runtime change. |
| Auth | JWT HS256 via `Authorization: Bearer` or httpOnly `access_token` cookie (header wins). Password sign-in per ADR 0040 — the demo backend's base trio (login/logout/me) is the ratified UX. |
| `status_label` | Server-rendered Chinese labels are kept but display-only; the frontend i18n layer owns user-facing labels. |

## 2. Normalisations the backend applies at integration

Spec-side fixes to internal inconsistencies in the implemented backend. Each is zero-or-trivial
backend cost and carries an `x-implementation-note` on the operation:

1. **Path rename** — `PUT /api/admin/clinics/{clinic_id}/companies/{company_id}/templates` →
   `.../insurance-companies/{company_id}/templates` (the same router already uses
   `insurance-companies` for the sibling routes). The demo backend still serves the old segment;
   rename or alias at integration. The frontend client + mocks already use the new path.
2. **DELETE returns 204 uniformly** — `DELETE /api/admin/templates/{template_id}/fields/{field_id}`
   returns 204 No Content (the demo returns 200 `{"success": true}`; entity deletes are 204
   everywhere else).
3. **Typed mapping-save result** — `POST .../fields/{field_id}/mapping` returns
   `FieldMappingSaveResult {id}` (the demo returns an untyped dict).
4. **Typed logout** — `POST /api/auth/logout` returns `SuccessResponse` (the demo returns an ad-hoc
   dict).

## 3. Retained frontend decisions (materially better)

- **Auth adapter seam.** The contract keeps the backend's base auth ops, but the frontend's
  swappable `AuthAdapter` (`demoJwtCookieAdapter` ↔ `workosAdapter`) is the integration seam: the
  contract stays stable while the identity provider swaps later. The nine `auth-flow` operations
  (MFA challenge/verify, recovery, account discovery, clinic selection, session state/refresh,
  re-auth deep links) are the tagged FUTURE-AUTH extension group behind that seam.
- **The 16 frontend-only module groups** (61 operations tagged `x-backend-status`) are the forward
  contract for capabilities the demo backend lacks — document inbox, staff hand-off, doctor
  settings, notifications, support access, coverage registry, claim extensions, and the console's
  audit/tickets/tags/analytics/impersonation/claims-oversight/account-management
  groups. All are authored in the backend's own dialect, so adopting them costs the backend team
  nothing stylistically. Per-endpoint view: [endpoint-checklist.md](endpoint-checklist.md).
- **Account management (ADR 0041)** includes the atomic switch operation
  `PUT /api/admin/doctors/{doctor_id}/clinics` (`{clinic_ids}` set-collection replace, mirroring the
  backend's own clinic insurance-companies pattern) — closing the link/unlink/**switch** gap.
- **Declared body extensions** (folded into the canonical schemas as optional properties, listed in
  the checklist's body-extensions table): `confirmed` + `row_version` on `PUT .../fields` (per-field
  confirmation set + claim-level optimistic lock — the most load-bearing gap), `clinic_id` +
  `clinic_name` on `ClaimListItem` (merged-workspace attribution), `mfa_enabled` +
  `merged_workspace` on `LoginResponse`/`MeResponse` (ADRs 0040/0041).

## 4. Revised semantics: file/PDF delivery (signed URLs)

Field **shapes** are unchanged (plain URL strings; the frontend treats them as opaque), but the
production **semantics** are binding:

| Field class | Fields | Production semantics |
|---|---|---|
| Patient documents | `generated_pdf_url`, `pdf_url`, `preview_pdf_url`, `export_url` | Short-lived presigned URLs (GCS/S3). Never durable public URLs. |
| Form templates | `original_pdf_url` | Signed URLs, medium TTL (internal annotation use). |
| Branding assets | `logo_url`, `url` (logo upload), `chop_image_url`, `signature_url`, `signature_image_url` | Signed or public; long TTL acceptable. |

The demo backend returns plain storage URLs — the swap is a storage-layer change
(`upload_bytes` → presigner) at production hardening, with no contract-shape change.

## 5. Intentional Phase-1 deltas vs design 0001

The engineering hub's API design (`acuity-dev/domains/backend/designs/0001-api-contracts.md`)
mandates a different cross-cutting dialect. For Phase 1 the **shipped backend dialect wins** — the
spec must feel native to the team that builds against it, and none of the mandates below justify a
migration of 72 working operations. Each is recorded as a deliberate delta, not silent
non-compliance; revisiting any of them belongs to the production data-layer plan, not this contract.

| Design-0001 mandate | Phase-1 position | Revisit trigger |
|---|---|---|
| Prefixed ULIDs (`clm_...`) | Integer ids stay. ULIDs are architecturally nicer (no enumeration, no ordering leak) but id-type swap is the single most expensive migration on the table, and cross-tenant reads already 404. | Production data layer (PROD-20); if ULIDs are wanted, they land there — not as a Phase-1 contract break. |
| Cursor pagination | Offset `Page[T]` stays; `total` is load-bearing and clinic-scoped Phase-1 volumes make OFFSET perf immaterial. | A second consumer or measured OFFSET pain in production. |
| `/v1/` path versioning | `/api` stays; a single first-party client and one active version make `/v1` inert. Breaking changes go through the ADR + deprecation-window **process** of design 0001 (retained as process, not path). | A second external consumer. |
| RFC 7807 errors (`type`/`title`/`instance` URIs) | The backend envelope stays; the codes are already SCREAMING_SNAKE and the client normalises. RFC 7807 is observability machinery, not client contract value. Optional `request_id` added instead. | Platform observability build-out. |
| Mandatory `Idempotency-Key` | Reserved optional header on state-changing POSTs under `/api/admin` + `/api/doctor` (declared in the spec so later enforcement is non-breaking). Mandatory keys need a durable key store — real infrastructure to build with the production platform. The claim state machine + `row_version` guard the demo's mutations. | Production platform build. |
| `data/error/meta` envelope | Bare payloads stay; retro-wrapping 72 operations breaks everything for nothing. | Never, absent a concrete consumer need. |
| WorkOS sessions | The auth-flow FUTURE-AUTH group + the AuthAdapter seam stage the journey; the demo's password + cookie auth is the ratified Phase-1 UX (ADR 0040). | Identity-provider integration. |

## 6. Backend asks (non-contract)

Implementation-quality items the backend team should pick up alongside the contract (from the
round-7 contract audit):

1. Make the session cookie's `secure` flag environment-driven (hardcoded `False` in the demo).
2. Rate-limit `POST /api/auth/login` (ADR 0040 compensating control).
3. Wire the existing-but-unwritten `operation_log` table (the `admin-audit` group reads it).
4. Add claim-level `row_version` when the `FieldsUpdate` extension lands (409 on stale writes).
5. Admin sub-roles (SUPER_ADMIN / OPERATOR / ANNOTATOR) are not differentiated by the demo's
   authorisation; the spec documents role-namespace access as the Phase-1 rule — sub-role
   enforcement is a backend follow-up.
6. The `status` field inside `DoctorUpdate` / `CompanyUpdate` is deprecated in favour of the
   dedicated `PATCH .../status` operations (marked in the spec; servers keep accepting it).

## 7. Regeneration workflow

The spec is hand-maintained; everything else derives from it:

```sh
pnpm -F @acuity/types generate                     # types (src/generated/openapi.ts)
pnpm -F @acuity/api-client verify                  # spec-registry parity, typed fns, MSW handlers, fixtures
pnpm -F @acuity/api-client gen:endpoint-checklist  # docs/api/endpoint-checklist.md
pnpm run gen:api-docs                              # docs/api/reference.md
```

`packages/api-client/src/endpoints/frontend-only.registry.json` carries the frontend-implementation
metadata (typed function, module, surfaces, MSW status) for every `x-backend-status` operation;
`verify` fails on any drift between it and the spec.
