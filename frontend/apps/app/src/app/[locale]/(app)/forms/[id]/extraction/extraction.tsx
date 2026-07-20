"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "@acuity/i18n/navigation";
import { useTranslations } from "next-intl";
import { ApiError, claims } from "@acuity/api-client";
import { Button, Callout, SparkleIcon } from "@acuity/ui";
import { useApiErrorMessage } from "@/lib/api-error";
import { LoopScaffold } from "@/components/loop/loop-scaffold";
import { CatchUpArc, ReviewSurfaceSkeleton } from "@/components/ui/loaders";
import { ClaimNotFound } from "@/components/ui/claim-not-found";

// Extraction (step 3). The whole screen IS the loading state: a form-shaped
// skeleton mirroring the populated review (summary bar + filter row + field
// rows beside the preview pane), escalating progress copy, and the catch-up
// arc. Fires the AI extract on mount; on result routes to review; on
// AI-unavailable degrades to a fully-operable manual review. Any OTHER failure
// surfaces as a specific, retryable error — never silently masked as manual
// mode (matrix 4.4.4).

const ESCALATE_AFTER_MS = 2500;

type Phase = "working" | "degraded" | "failed" | "not-found";

export function Extraction({ claimId }: { claimId: number }) {
  const t = useTranslations("extraction");
  const router = useRouter();
  const apiMessage = useApiErrorMessage();

  const [escalated, setEscalated] = useState(false);
  const [phase, setPhase] = useState<Phase>("working");
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const startedRef = useRef<number | null>(null);
  // User-initiated aborts only (cancel/leave). Effect cleanup must NOT cancel:
  // StrictMode's simulated remount would orphan the in-flight extract.
  const abortedRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setEscalated(true), ESCALATE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (startedRef.current === attempt) return;
    startedRef.current = attempt;
    setPhase("working");
    setFailure(null);
    (async () => {
      try {
        await claims.extractClaim(claimId);
        if (!abortedRef.current) router.replace(`/forms/${claimId}/review`);
      } catch (cause) {
        if (abortedRef.current) return;
        if (cause instanceof ApiError && cause.kind === "ai_unavailable") {
          // Degrade: fall through to a fully-operable manual review.
          setPhase("degraded");
          setTimeout(() => {
            if (!abortedRef.current) {
              router.replace(`/forms/${claimId}/review?mode=manual`);
            }
          }, 1800);
        } else if (cause instanceof ApiError && cause.kind === "not_found") {
          setPhase("not-found");
        } else {
          // An honest failure state with retry + manual fall-through — the
          // cause is named, not silently rerouted.
          setFailure(cause instanceof ApiError ? cause : null);
          setPhase("failed");
        }
      }
    })();
  }, [claimId, router, attempt]);

  if (phase === "not-found") {
    return (
      <LoopScaffold step={2} heading={t("step-heading")} headingHidden confirmLeave={false}>
        <ClaimNotFound />
      </LoopScaffold>
    );
  }

  return (
    <LoopScaffold step={2} heading={t("step-heading")} headingHidden confirmLeave={false}>
      <div className="mb-6">
        {phase === "degraded" ? (
          <Callout tone="warning" icon={<SparkleIcon size={20} />}>
            {t("ai-unavailable")}
          </Callout>
        ) : phase === "failed" ? (
          <Callout tone="danger">
            <div className="flex flex-col gap-3">
              <p className="font-medium text-foreground">{t("failed-title")}</p>
              <p className="text-sm text-muted-foreground">{apiMessage(failure ?? undefined)}</p>
              <div className="flex flex-wrap gap-2.5">
                <Button variant="outline" size="sm" onClick={() => {
                    abortedRef.current = false;
                    setAttempt((a) => a + 1);
                  }}>
                  {t("retry")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.replace(`/forms/${claimId}/review?mode=manual`)}
                >
                  {t("fill-manually")}
                </Button>
              </div>
            </div>
          </Callout>
        ) : (
          <div
            className="flex items-center gap-3.5 rounded-md border border-border bg-card p-4"
            role="status"
            aria-live="polite"
          >
            <CatchUpArc bare />
            <p className="text-base font-medium text-foreground">
              {escalated ? t("progress-escalated") : t("progress-initial")}
            </p>
          </div>
        )}
      </div>

      {/* Form-shaped skeleton mirroring the populated review (no layout shift
          on arrival): preview pane beside summary bar + filter chips + rows. */}
      {phase !== "failed" && <ReviewSurfaceSkeleton label={t("progress-initial")} />}

      {phase === "working" && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="ghost"
            onClick={() => {
              abortedRef.current = true;
              router.replace(`/forms/${claimId}/intake`);
            }}
          >
            {t("cancel")}
          </Button>
        </div>
      )}
    </LoopScaffold>
  );
}
