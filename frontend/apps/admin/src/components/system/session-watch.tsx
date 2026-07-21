"use client";

// Client-side session validation for the server-rendered console. The
// middleware gate is presence-only (edge cookie check); this watch validates
// the session itself via the shared auth-ui guard and routes an expired
// session to sign-in with ?reason=expired&from=<path>, closing the re-auth
// deep-link loop end to end.
//
// Demo reachability: the canonical scenario names from the mock scenario
// engine apply per visit via ?scenario=<name>[,<n2>] on any console URL
// (e.g. ?scenario=session-expired drives the full expiry re-entry journey).
// The parameter is consumed here — applied to the client scenario store and
// stripped from the URL — so the preserved return target replays clean after
// re-authentication.

import { useEffect, useState } from "react";
import { operatorAuthMount, useSessionGuard } from "@acuity/auth-ui";

const MOCKING_ENABLED = process.env.NEXT_PUBLIC_API_MOCKING !== "disabled";

export function SessionWatch({ locale }: { locale: string }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const url = new URL(window.location.href);
      const names = url.searchParams.getAll("scenario");
      if (names.length > 0) {
        try {
          const scenario = await import("@acuity/api-client/mocks/scenario");
          for (const raw of names) {
            for (const name of raw.split(",")) {
              const trimmed = name.trim();
              if (trimmed in scenario.SCENARIO_NAMES) {
                scenario.applyMockScenarioName(
                  trimmed as keyof typeof scenario.SCENARIO_NAMES,
                );
              }
            }
          }
        } catch {
          // Scenario module unavailable — proceed with the plain check.
        }
        url.searchParams.delete("scenario");
        window.history.replaceState(null, "", url.toString());
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return ready ? <Guard locale={locale} /> : null;
}

function Guard({ locale }: { locale: string }) {
  useSessionGuard({
    locale,
    signInPath: "/sign-in",
    mocks: MOCKING_ENABLED,
    allowedRoles: operatorAuthMount.allowedRoles,
  });
  return null;
}
