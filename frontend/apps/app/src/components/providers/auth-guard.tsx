"use client";

import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { useSessionGuard, type SessionGuard } from "@acuity/auth-ui";

// The one page-level session gate for every protected surface: the (app)
// route-group layout wraps its children here, so each signed-in page renders
// only once the session is validated beyond the middleware's cookie-presence
// check. On an expired or absent session the guard redirects to sign-in with
// the current path preserved (?reason=expired&from=…) and the journey returns
// here after re-authentication.
//
// `recheck` is shared via context so the 401 handling path (the
// session-expired overlay in the system layer) can re-run the validation,
// which performs the deep-link-preserving redirect.

const MOCKING_ENABLED =
  (process.env.NEXT_PUBLIC_API_MOCKING ?? "enabled") === "enabled";

const SessionGuardContext = createContext<SessionGuard | null>(null);

export function useAppSessionGuard(): SessionGuard | null {
  return useContext(SessionGuardContext);
}

export function AuthGuard({
  locale,
  children,
}: {
  locale: string;
  children: ReactNode;
}) {
  const t = useTranslations("app");
  const guard = useSessionGuard({
    locale,
    signInPath: "/sign-in",
    mocks: MOCKING_ENABLED,
  });

  if (guard.state !== "authenticated") {
    // The accent-tint loading treatment while the session check runs (or the
    // redirect commits) — never a silent blank.
    return (
      <div
        className="flex min-h-screen bg-background"
        role="status"
        aria-live="polite"
      >
        <div className="hidden h-screen w-62 shrink-0 border-r border-border p-4 lg:block">
          <div className="acuity-shimmer h-11 rounded-md bg-[var(--color-loading-placeholder)]" />
        </div>
        <div className="flex-1 p-8 lg:p-12">
          <div className="acuity-shimmer mb-6 h-9 w-64 rounded-md bg-[var(--color-loading-placeholder)]" />
          <div className="acuity-shimmer mb-3 h-24 rounded-md bg-[var(--color-loading-placeholder)]" />
          <div className="acuity-shimmer h-24 rounded-md bg-[var(--color-loading-placeholder)]" />
          <p className="acuity-reduced-only mt-4 text-sm text-muted-foreground">{t("loading")}</p>
          <span className="sr-only">{t("loading")}</span>
        </div>
      </div>
    );
  }

  return (
    <SessionGuardContext.Provider value={guard}>
      {children}
    </SessionGuardContext.Provider>
  );
}
