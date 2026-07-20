# acuity-frontend

Frontend monorepo for Acuity, insurance-claim form automation for Hong Kong clinics: claim data is AI-extracted, reviewed and confirmed by the doctor, and produced as a print-faithful facsimile of the insurer's own paper form. This repo contains every user-facing surface — the doctor/clinic application, the marketing site, the operator console, and an internal design-review harness — plus the shared packages they build on. The backend is mocked in full (MSW), so every surface runs, and is tested end to end, without a server.

## Repository layout

| Workspace | What it is |
|---|---|
| `apps/app` | Doctor/clinic application (the main product) — dev port 3000 |
| `apps/site` | Marketing / public website — dev port 3001 |
| `apps/admin` | Operator / admin console — dev port 3002 |
| `apps/design-review` | Internal review surface for the design-token system — dev port 3005 |
| `packages/config` | Shared tsconfigs, the eslint flat config, PostCSS (Tailwind v4) config |
| `packages/types` | The canonical OpenAPI contract (`openapi.json`) + TypeScript types generated from it |
| `packages/theme` | `@component-core/acuity`: the Caliber token graph + CSS-variable theme overlay |
| `packages/ui` | The single UI import surface — base kit + theme + Tailwind wiring |
| `packages/api-client` | One typed fetch layer over `/api/*`, a swappable auth adapter, and the MSW mock backend |
| `packages/i18n` | Shared locale routing, request config (Hong Kong time anchor), Intl formatters |
| `packages/auth-ui` | Shared auth journey set + mount kit (sign-in shell, MFA, session guard, sign-out) |
| `packages/auth-ui-dev-harness` | Minimal consuming app for reviewing auth journeys in isolation — dev port 3006 |
| `packages/quality` | Unit/contract tests + the Playwright e2e and accessibility (axe) suite |

The apps are Next.js 15 (App Router) on React 19 and Tailwind v4. Authentication is not a separate app: the journeys live in `@acuity/auth-ui` and are mounted inside the doctor app and the operator console.

## Setup

Node ≥ 20 and pnpm (version pinned via `packageManager`; `corepack enable` suffices).

```sh
pnpm install
```

No npm login is needed: the design-kit base is consumed from the vendored tarball in `vendor/`, and every other `@acuity/*` / `@component-core/*` package is workspace-local.

## Development

```sh
pnpm dev                          # all surfaces (ports above)
pnpm --filter @acuity/app dev     # one surface
pnpm --filter @acuity/auth-ui dev # auth journey harness on 3006
```

Every surface runs mock-first: `@acuity/api-client` ships MSW handlers for the complete contract, backed by one coherent bilingual fixture universe, so no backend is required. The doctor app carries a dev-only scenario switcher (latency, failure, conflict, session-expiry injection); scenarios can also be set per request (`?scenario=<name>`) or via `NEXT_PUBLIC_MOCK_SCENARIO`. Demo accounts and the scenario vocabulary are documented in `packages/api-client/README.md`.

Environment variable names (values are never committed): `NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_API_MOCKING`, `NEXT_PUBLIC_MOCK_SCENARIO`, `API_PROXY_TARGET`, `NEXT_PUBLIC_CONSOLE_SIGN_IN_URL`, `NEXT_PUBLIC_SITE_URL`. See `apps/app/.env.example`.

## Build and quality gates

```sh
pnpm typecheck    # every package + app
pnpm lint         # monorepo-wide eslint (a11y + token foundation rules at error)
pnpm check:i18n   # en-HK ↔ zh-Hant-HK catalog parity + Simplified-Chinese scan
pnpm check:tokens # raw-value token lint (ratcheted per-file baseline)
pnpm test         # unit + contract suites (includes the api-client data-layer verifier)
pnpm build        # all apps, both locale trees
pnpm test:e2e     # Playwright journeys + smokes + axe (boots the dev servers itself)
```

CI (`.github/workflows/ci.yml`) runs the same gates; all are blocking.

## Design system

Three layers, consumed through one import surface:

- **`@component-core/ui`** — the base component kit (public npm; pinned here via `vendor/component-core-ui-0.2.0.tgz`).
- **`@component-core/acuity`** (`packages/theme`) — Acuity's look. The Caliber design tokens live as DTCG JSON (`presets/caliber-light.tokens.json`, a build-time snapshot of the canonical token graph); `pnpm --filter ./packages/theme generate` compiles them to `tokens.css`, a semantic CSS-variable overlay that re-values the base kit's variables. CI verifies the compiled CSS matches the preset byte for byte.
- **`@acuity/ui`** (`packages/ui`) — what apps actually import. Re-exports the base roster under the theme, owns the Tailwind wiring (`styles.css`, imported once per app), and carries a small set of deliberately shadowed or Acuity-only components (shell, ops grid, table, avatar, status badge); each shadowed file's header comment records why it diverges from the base.

Apps never import `@component-core/*` directly, and raw colour/spacing values are lint-gated — every visual property rides the token layer.

## Backend integration

The repo is built against a canonical, hand-maintained API contract; the backend team's job is to implement it.

- **`packages/types/openapi.json`** — the contract of record: 133 operations, of which 72 are already implemented by the demo backend and 61 are the forward contract (tagged `x-backend-status: MISSING | PARTIAL | DRIFT | FUTURE-AUTH`). Dialect: `/api/{auth,doctor,admin}` role-prefixed paths, integer ids, snake_case, offset `Page[T]` pagination, `{"error":{code,message}}` envelope, closed workflow enums.
- **`docs/api/implementation-notes.md`** — read this first. Every intentional decision: adopted backend conventions, the four spec-side normalisations, retained frontend decisions, signed-URL delivery semantics, the deliberate Phase-1 platform deltas, and the non-contract backend asks.
- **`docs/api/endpoint-checklist.md`** (generated) — the per-endpoint build list with implementation status.
- **`docs/api/reference.md`** (generated) — the full operation + schema reference.

Changing the contract:

```sh
# edit packages/types/openapi.json, then:
pnpm -F @acuity/types generate                     # regenerate the TypeScript types
pnpm -F @acuity/api-client verify                  # parity gate: spec ↔ registry ↔ typed fns ↔ MSW handlers ↔ fixtures
pnpm -F @acuity/api-client gen:endpoint-checklist  # refresh docs/api/endpoint-checklist.md
pnpm run gen:api-docs                              # refresh docs/api/reference.md
```

The parity gate also runs inside `pnpm test`, so contract drift fails CI. Pointing a surface at a real backend is configuration, not code: set `NEXT_PUBLIC_API_MOCKING=disabled` plus the API base/proxy variables, and swap the auth adapter (`setAuthAdapter`) when the identity provider lands.

## Internationalisation

Every surface is bilingual — `en-HK` (default) and `zh-Hant-HK` — via `next-intl` on the shared `@acuity/i18n` routing and request config, `[locale]`-routed, with per-app catalogs under each app's `messages/` (plus package-local catalogs in `@acuity/auth-ui`). All date/time output is anchored to Hong Kong time. `pnpm check:i18n` enforces exact key parity and scans for Simplified-Chinese characters; the build prerenders both locale trees, so every catalog is exercised at build time.
