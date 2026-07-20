"use client";

// Locale-level error boundary: an uncaught render error shows the calm,
// localised inline error grammar (never Next's default screen, never a stack
// trace). Client-fetch failures inside routes keep the use-api four-state
// pattern; this boundary is the last-resort net.

import { useTranslations } from "next-intl";
import { Button } from "@acuity/ui";
import { ErrorPanel } from "@/components/ui/states";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("errors");
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <ErrorPanel
        title={t("route-error-title")}
        description={t("route-error-body")}
        action={
          <div>
            <Button variant="outline" onClick={reset}>
              {t("route-error-retry")}
            </Button>
          </div>
        }
      />
    </main>
  );
}
