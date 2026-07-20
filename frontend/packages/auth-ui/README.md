# @acuity/auth-ui

The shared authentication journey set + mount kit for the Acuity surfaces.
One journey component carries the finalised centered-card shell with both
variants — the doctor (warm) sign-in and the operator (hardened) console
sign-in — wired end to end over the swappable `@acuity/api-client` auth
adapter (demo JWT today, WorkOS + MFA target). The doctor app and the
operator console mount the same package with different configs; the
standalone auth app is retired in favour of these per-app mounts.

## What the journey covers

- Identity (OIDC button; the provider ceremony is a hosted flow — the UI
  never handles a credential) → MFA challenge + verify (doctor passkey
  confirm; operator hardware-key with the LD3 determinate step indicator) →
  clinic selection on multi-clinic identities (account discovery via
  `/auth/clinics`, bilingual names from the API) → quiet landed confirm →
  redirect to the destination.
- Post-auth handoff: a preserved deep-link target wins over the surface's
  default landing path. Targets ride a single-use server-validated token
  (return-target allowlist; open-redirect defence), never a raw identifier
  in history.
- Session-expired re-entry: `?reason=expired` renders the calm note;
  re-authentication returns to the exact preserved path.
- Per-app session isolation: a session whose role the surface does not
  accept is logged out and rendered as permission-denied inside the card.
- Recovery (lost device / lost security key): deliberate, never optimistic;
  a failed start is visible.
- Every failure state is demo-reachable (see State review below): wrong
  credentials, locked account, MFA failed/expired, network error, latency +
  long-wait copy, recovery failed, wrong-app session.
- In-place English / 中文 toggle (doctor only): the card copy re-renders
  without leaving the flow — mid-step state is preserved; the URL and
  `<html lang>` stay truthful.

## Mounting into an app

1. **Sign-in page** — `app/[locale]/(auth)/sign-in/page.tsx`:

   ```tsx
   import { createAuthPage, doctorAuthMount } from "@acuity/auth-ui";

   export default createAuthPage({
     ...doctorAuthMount,
     landingPath: "/",            // this app's work home
     peerSignInHref: "/sign-in",  // console URL in production
   });
   ```

   The operator console mounts `operatorAuthMount` instead (landing
   `/clinics`, hardware-key factor, host signal, no language toggle). In
   production the two sign-ins live on distinct hostnames; each app serves
   only its own mount, and `hostName` overrides the host-signal copy.

2. **Middleware** — replace the app's `src/middleware.ts` body:

   ```ts
   import { createAuthMiddleware } from "@acuity/auth-ui/middleware";

   export default createAuthMiddleware({
     signInPath: "/sign-in",
     publicPaths: [],
   });

   export const config = {
     matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
   };
   ```

   The gate composes with the shared locale middleware from `@acuity/i18n`
   (presence-only cookie check: the real httpOnly `access_token`, or the
   mock-mode marker `MOCK_SESSION_COOKIE` — MSW cannot set httpOnly cookies).
   Unauthenticated requests redirect to sign-in before any protected route
   renders, carrying the requested internal path as `from=`.

3. **Styles** — in the app's `globals.css`, after the UI base:

   ```css
   @import "@acuity/ui/styles.css";
   @import "@acuity/auth-ui/styles.css";
   @source "../../node_modules/@acuity/auth-ui/src/**/*.{ts,tsx}";
   ```

   (The `@source` glob path is relative to the CSS file; adjust depth.)

4. **Sign-out** — anywhere in the authenticated shell:

   ```tsx
   import { SignOutButton } from "@acuity/auth-ui";

   <SignOutButton locale={locale} signInPath="/sign-in">Sign out</SignOutButton>
   ```

   The adapter's logout POSTs `/api/auth/logout` (never a GET link), clears
   the mock marker, and lands on sign-in. An imperative `signOut()` is also
   exported.

5. **Protected pages** — validate the session beyond cookie presence:

   ```tsx
   const { state, recheck } = useSessionGuard({ locale, signInPath: "/sign-in" });
   ```

   On an expired/absent session the guard redirects to sign-in with
   `?reason=expired&from=<current-path>`; the journey exchanges the path for
   a single-use allowlisted token and returns after re-auth. Call `recheck()`
   from a 401 interceptor.

6. **Manifests** — add to the app's `package.json` dependencies:
   `"@acuity/auth-ui": "workspace:*"`, and to `next.config.ts`
   `transpilePackages`: `"@acuity/auth-ui"`.

## Messages

The bilingual catalogs (en-HK + zh-Hant-HK, parity enforced by
`scripts/check-i18n.mjs`) live in `messages/` under the single `auth`
namespace. The journey renders through its own provider, so mounting needs
no app-catalog merge. An app that references auth copy outside the journey
merges them in its request config:

```ts
import { authUiMessages } from "@acuity/auth-ui/messages";

export default createLocaleRequestConfig(async (locale) => {
  const app = (await import(`../../messages/${locale}.json`)).default;
  return { default: { ...app, ...authUiMessages(locale) } };
});
```

The Traditional Chinese strings are HK-written drafts; production copy is
clinician-authored per the brand spec (tracked follow-up, never
machine-translated, never Simplified).

## State review (mock-first)

The sign-in page accepts a documented query vocabulary so every state is
reachable in the running app:

| Query | State |
|---|---|
| `?demo-account=nobody` | wrong credentials (401) |
| `?demo-account=dr.locked` | locked account (429) |
| `?demo-account=dr2188` | single-clinic doctor (no clinic step) |
| `?demo-mfa=fail` | MFA failed (one-shot; retry succeeds) |
| `?demo-mfa=expired` | MFA challenge expired (reset + re-challenge) |
| `?reason=expired` | session-expired note |
| `?demo-scenario=slow-network` | latency + LD6 long-wait copy |
| `?demo-scenario=network-error` | network error |
| `?demo-account=dr2207` on the console mount | wrong-app session rejection |

`demo-*` parameters act only in mock mode. Scenario names are the canonical
set from `@acuity/api-client/mocks/scenario`.

## Dev harness

`packages/auth-ui-dev-harness` is a minimal consuming Next.js app (a sibling
workspace package, so its link to this package never nests inside it) used to
review the journeys and run the Playwright suite:

- `pnpm --filter @acuity/auth-ui dev` — harness on `http://localhost:3006`
  (home page links every journey + state).
- `pnpm --filter @acuity/auth-ui test:e2e` — runs
  `packages/quality/e2e/auth-ui-journeys.spec.ts` in isolation (the spec
  boots the harness itself; the full `@acuity/quality` suite also picks it
  up).

## Verification

- `pnpm --filter @acuity/auth-ui typecheck`
- `pnpm --filter @acuity/auth-ui test` — guard/handoff logic + the deep-link
  and journey seams over the MSW node server
- `pnpm --filter @acuity/auth-ui test:e2e` — 16 journey/state/a11y specs
- `node scripts/check-i18n.mjs` — catalog parity (package catalogs included)
- `node scripts/check-tokens.mjs` — zero ad-hoc values in this package
