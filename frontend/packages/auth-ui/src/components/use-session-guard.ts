"use client";

/*
 * Page-level session guard for protected surfaces (the middleware gate is
 * presence-only; this validates the session server-side). On an expired or
 * absent session it redirects to sign-in with ?reason=expired and the current
 * in-app path as `from=`; the sign-in journey exchanges that path for a
 * single-use deep-link token, validated server-side against the return-target
 * allowlist, and returns here after re-authentication.
 *
 * The exchange happens on the sign-in page (not here) so the seam works
 * mock-first: the mock token store lives per page context, while a raw
 * internal path survives the navigation. A live backend keeps the same shape
 * — the sign-in page issues the token against the real, persistent store.
 */

import { useCallback, useEffect, useState } from "react";
import { auth, frontendOnly } from "@acuity/api-client";
import { isInternalPath } from "../journey/logic";

export type SessionGuardState = "checking" | "authenticated" | "redirecting";

export interface SessionGuardOptions {
  locale: string;
  signInPath: string;
  // Start the MSW worker before checking (mock-first default).
  mocks?: boolean;
}

export interface SessionGuard {
  state: SessionGuardState;
  // Re-run the check (e.g. after an action reported 401 / session expiry).
  recheck: () => void;
}

// Strip the locale segment so the preserved return target is the app-internal
// path the allowlist knows about.
function currentInternalPath(locale: string): string {
  const { pathname, search } = window.location;
  const prefix = `/${locale}`;
  const rest = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length) || "/"
    : pathname;
  return `${rest}${search}`;
}

export function useSessionGuard(options: SessionGuardOptions): SessionGuard {
  const { locale, signInPath, mocks = true } = options;
  const [state, setState] = useState<SessionGuardState>("checking");
  const [nonce, setNonce] = useState(0);

  const recheck = useCallback(() => {
    setState("checking");
    setNonce((value) => value + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (mocks) {
        try {
          const { startMockWorker } = await import(
            "@acuity/api-client/mocks/browser"
          );
          await startMockWorker();
        } catch {
          // A failed worker start falls through to the session check.
        }
      }
      let authenticated = false;
      try {
        if (mocks) {
          const session = await frontendOnly.authFlow.getSession();
          authenticated = session.authenticated;
        } else {
          // In live mode there is no frontend-only session endpoint. Validate
          // the httpOnly access_token cookie through the real FastAPI route.
          authenticated = (await auth.currentUser()) !== null;
        }
      } catch {
        authenticated = false;
      }
      if (cancelled) return;
      if (authenticated) {
        setState("authenticated");
        return;
      }
      setState("redirecting");
      const returnTarget = currentInternalPath(locale);
      const query = new URLSearchParams({ reason: "expired" });
      if (isInternalPath(returnTarget)) query.set("from", returnTarget);
      window.location.replace(`/${locale}${signInPath}?${query.toString()}`);
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, signInPath, mocks, nonce]);

  return { state, recheck };
}
