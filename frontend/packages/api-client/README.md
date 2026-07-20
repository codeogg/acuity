# @acuity/api-client

One typed fetch layer over the backend `/api/*` contract, with a swappable auth
adapter and a complete MSW mock backend for mock-first development. Every app in
the monorepo consumes this package; no app maintains its own fetch wrapper, mock
architecture, or fixture dataset.

## Layout

| Path | What it is |
|---|---|
| `src/client.ts` | `request` + `api` verb helpers: same-origin `/api` base, snake_case preserved, cookie auth (`credentials: "include"`), both error shapes (`{error:{code,message}}` + FastAPI 422) mapped to a typed `ApiError` (`kind`: `conflict` 409 / `not_found` tenant-404 / `ai_unavailable` 503 / …) |
| `src/endpoints/` | One typed function per backend-implemented operation in the canonical contract `../types/openapi.json` (72 operations): `ai`, `auth`, `claims`, `clinics`, `companies`, `doctors`, `fields`, `health`, `templates` |
| `src/endpoints/frontend-only/` | Typed modules for the forward-contract operations tagged `x-backend-status` in the canonical spec (marker: `frontend-only: pending backend`), registered machine-readably in `frontend-only.registry.json` (61 operations) |
| `src/auth/` | The swappable auth adapter seam: `demo-jwt-cookie-adapter` (current contract) and `workos-adapter` (spec target); swap with one `setAuthAdapter()` call |
| `src/mocks/` | The MSW mock backend: stateful stores, one shared fixture universe, the scenario engine, and a handler for **every** operation (contract + frontend-only) |

## Contract rules (binding)

The canonical contract is `packages/types/openapi.json` (its `info.description`
carries the full dialect statement; developer docs in `docs/api/`): snake_case
fields, `{items,total,page,page_size}` pagination, `{error:{code,message}}`
envelope (messages may be Traditional Chinese — never assume English), native
422 for validation, JWT bearer / cookie auth, tenant isolation returns **404
never 403**, claim status machine `DRAFT → AI_FILLED → CONFIRMED → PRINTED`,
`row_version` optimistic locking → 409 on conflict.

### Changing the contract

Edit `packages/types/openapi.json` (it is hand-maintained — the single source
of truth for every operation, implemented or forward). Then regenerate and
re-verify:

```sh
pnpm -F @acuity/types generate          # openapi.json -> src/generated/openapi.ts
pnpm -F @acuity/api-client verify       # spec-registry parity, functions, handlers, fixtures
pnpm -F @acuity/api-client gen:endpoint-checklist   # refresh docs/api/endpoint-checklist.md
pnpm run gen:api-docs                   # refresh docs/api/reference.md
```

Forward-contract operations (not yet implemented by the backend) carry
`x-backend-status` in the spec and a matching row in
`src/endpoints/frontend-only.registry.json`; `verify` fails on any drift
between the two.

## Mock backend

- **Stores** (`src/mocks/stores/`) — in-memory, module-scoped state: the doctor
  claims loop (per-claim `rowVersion` + per-field confirmation), the admin
  entity groups (CRUD, enablement, parse simulation), the auth journey
  (credentials → MFA → clinic selection → session, recovery, deep-link tokens),
  and the frontend-only destinations (notifications, tickets, tags, saved
  views, hand-offs, audit trail, impersonation).
- **Fixture universe** (`src/mocks/fixtures/universe.json`) — ONE coherent
  bilingual dataset for every surface: the clinics/doctors/claims the operator
  console lists are the entities the doctor app mutates. Edit the JSON, never a
  derived copy; `pnpm verify` asserts the cross-references.
- **Handlers** (`src/mocks/handlers/`) — `auth`, `doctor`, `admin`, plus the
  root `/health` probe; aggregated in `src/mocks/handlers.ts`. Every handler
  runs the scenario gate (latency + failure injection) first.
- **Workers** — browser: `startMockWorker()` from `./mocks/browser` (needs
  `/mockServiceWorker.js` in the app's `public/`, `npx msw init public/`);
  node/SSR/tests: `./mocks/server`.

### Scenario engine (`src/mocks/scenario.ts`)

Three control layers, lowest to highest precedence:

1. **Env default** — `NEXT_PUBLIC_MOCK_SCENARIO="slow-network,ai-degrade"`
   (comma-separated names).
2. **Runtime dev hook** — `setMockScenario({ aiDegrade: true })` /
   `applyMockScenarioName("conflict-409")`; subscribe from a dev switcher via
   `subscribeMockScenario` + `getMockScenario` (`useSyncExternalStore`-ready).
3. **Per-request one-shot** — `?scenario=<name>` on any mocked request.

Canonical scenario names:

| Name | Effect |
|---|---|
| `baseline` | reset everything to defaults |
| `fast-network` / `slow-network` / `very-slow-network` | ~150 ms / ~900 ms / ~2500 ms latency on every response |
| `server-error` | every request returns 500 `{error:{code,message}}` |
| `network-error` | every request fails at the transport layer |
| `conflict-409` | state-changing writes return the 409 optimistic-lock outcome |
| `tenant-404` | tenant-scoped detail reads return 404 (isolation demo) |
| `ai-degrade` | AI extraction returns 503 `AI_UNAVAILABLE` (force_manual path); alias `ai-unavailable` accepted per-request |
| `session-expired` | authed requests return 401 (re-auth journey) |
| `empty-data` | list endpoints return an empty page |
| `operator-role` | the mock session identity is the operator, not the doctor |

### Demo accounts (auth journey)

Password for every account: `acuity-demo`. MFA TOTP code `246810`; backup code
`AAAA-BBBB-CCCC`; accounts with `hardware-key` verify with any code.

| Account | Role | Clinics | Notes |
|---|---|---|---|
| `dr2207` | DOCTOR | 142 + 103 | multi-clinic → clinic-selection step; the default booted session (clinic 142) |
| `dr2188` | DOCTOR | 142 | single clinic |
| `dr2301` | DOCTOR | 138 | single clinic, different tenant |
| `dr.locked` | DOCTOR | 142 | always returns the 429 locked outcome |
| `mcheng` | OPERATOR | — | console operator |
| `afounder` | SUPER_ADMIN | — | founder account |

Failure paths: wrong password → 401 envelope; `dr.locked` → 429; wrong MFA code
→ 422; session expiry / refresh / deep-link return targets are driven through
the frontend-only `/auth/session*` endpoints.

## Auth adapter seam

`auth.login/logout/currentUser/refresh` route through the active adapter.
`demoJwtCookieAdapter` speaks the current contract; `workosAdapter` is the
spec-target stub. Swapping is a config change:
`setAuthAdapter(workosAdapter)`. The mock backend implements the full folded
journey (credentials, MFA TOTP/backup, recovery, multi-clinic selection,
session expiry + re-auth, operator vs doctor roles) so `packages/auth-ui` can
build against it today.

## Frontend-only surface

Operations the demo backend does not provide are declared in the canonical
spec with `x-backend-status`, typed in `src/endpoints/frontend-only/` (types
generated from the spec via `@acuity/types`), and mock-implemented in full, so
every state in the surface matrices is demo-reachable.
`frontend-only.registry.json` is the frontend-implementation registry (module
→ ops → typed function); every op carries `backend_status` (`MISSING` — no
backend equivalent; `PARTIAL` — backend substrate but no usable API; `DRIFT` —
overlaps an existing contract op, reconcile rather than add; `FUTURE-AUTH` —
spec-target auth journey) and `msw_implemented` (asserted truthful by
`pnpm verify`). The endpoint checklist (`docs/api/endpoint-checklist.md`) is
regenerated from the spec plus the registry via `pnpm gen:endpoint-checklist`.
Body extensions to real contract ops (e.g. `confirmed` + `row_version` on
`PUT …/fields`) are folded into the canonical schemas as optional properties
and declared in the registry's `body_extensions` — backend asks, not silent
drift.

## Verification

`pnpm -F @acuity/api-client verify` (also the package's `test` script) asserts:
every `x-backend-status` op in the canonical spec matches the registry both
ways; 72 typed endpoint functions == 72 backend-implemented operations; every
frontend-only registry op has its typed function and valid `backend_status` /
`msw_implemented` tags; every operation has an MSW handler; and every fixture
cross-reference in `universe.json` resolves. Run it after touching the spec,
endpoints, handlers, the registry, or the universe.
