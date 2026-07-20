"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

// Starts the MSW mock worker before rendering data-dependent children, so the
// first api-client call is always intercepted (no race where a fetch fires
// before the service worker is ready). Mock-first is the default; when
// NEXT_PUBLIC_API_MOCKING is not "enabled" the worker is skipped and children
// render immediately (real backend path).
//
// SSR/SSG safe: the worker import is dynamic and no-ops server-side; the gate
// resolves ready=true on the server render so markup is produced, then the
// client effect starts the worker before the first data call.

const MOCKING_ENABLED =
  (process.env.NEXT_PUBLIC_API_MOCKING ?? "enabled") === "enabled";

export function MockBootstrap({ children }: { children: ReactNode }) {
  const t = useTranslations("app");
  const [ready, setReady] = useState(!MOCKING_ENABLED);

  useEffect(() => {
    if (!MOCKING_ENABLED) return;
    let cancelled = false;
    (async () => {
      const { startMockWorker } = await import("@acuity/api-client/mocks/browser");
      await startMockWorker();
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    // The accent-tint loading treatment while the mock worker registers —
    // never a silent blank (hard rule 1). Announced politely; shape mirrors
    // the shell (sidebar + work area) so arrival does not shift layout.
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

  return <>{children}</>;
}
