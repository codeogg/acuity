"use client";

// Reusable route error boundary body. Renders the design-kit ErrorState with a
// retry that calls the framework `reset`. The message never exposes internal
// error detail (architecture.md); a tenant-isolation 404 is surfaced by the
// route's not-found.tsx instead. Bilingual via next-intl.

import { useTranslations } from "next-intl";
import { ErrorState } from "@acuity/ui";

export function RouteError({ reset }: { reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <div className="p-6">
      <ErrorState
        title={t("load-failed-title")}
        description={t("load-failed-description")}
        onRetry={reset}
      />
    </div>
  );
}
