"use client";

import { Link } from "@acuity/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { claims } from "@acuity/api-client";
import type { HomeOverview, Page, ClaimListItem } from "@acuity/types";
import {
  AlertIcon,
  Button,
  Callout,
  ClockIcon,
  DownloadIcon,
  FilePlusIcon,
  PlusIcon,
  cn,
} from "@acuity/ui";
import { formatDate } from "@acuity/i18n/format";
import type { Locale } from "@/i18n/routing";
import { useApi } from "@/lib/use-api";
import { useApiErrorMessage } from "@/lib/api-error";
import { greetingKeyNow, relativeFromNow } from "@/lib/clock";
import { useCatalog } from "@/lib/catalog";
import { useSession } from "@/lib/session";
import { doctorShortName } from "@acuity/i18n/names";
import { resumeHref, isInProgress } from "@/lib/resume";
import { useResumeHints, usePendingHandoffs } from "@/lib/claim-hints";
import { PageContainer, Eyebrow } from "@/components/ui/page";
import { CardListSkeleton } from "@/components/ui/loaders";
import { EmptyPanel, ErrorPanel } from "@/components/ui/states";
import { ClaimStatusBadge, toClaimStatus } from "@/components/ui/status-badge";

// The post-authentication landing + In progress drafts (WORK -> In progress).
// Greeting (live clock, locale-correct doctor name), the tappable staff
// hand-off banner (counts pending hand-offs only), in-progress cards carrying
// insurer · form + patient + an honest resume hint, then recently-completed
// rows. The only primary action is the shell's "Start a form" (hard rule 3).

export function WorkHome() {
  const t = useTranslations("home");
  const tShell = useTranslations("shell");
  const locale = useLocale() as Locale;
  const apiMessage = useApiErrorMessage();
  const catalog = useCatalog();
  const { me } = useSession();

  const overview = useApi<HomeOverview>(() => claims.getHomeOverview());
  const list = useApi<Page<ClaimListItem>>(() => claims.listClaims());
  const { handoffs } = usePendingHandoffs();

  const loading = overview.loading || list.loading;
  const error = overview.error ?? list.error;

  const items = list.data?.items ?? [];
  const inProgress = items.filter((c) => isInProgress(c.status));
  const completed = items.filter((c) => {
    const s = toClaimStatus(c.status);
    return s === "PRINTED" || s === "CONFIRMED";
  });
  const hints = useResumeHints(inProgress.map((c) => c.id));

  const visibleIds = new Set(items.map((c) => c.id));
  const pendingHandoffs = handoffs.filter((h) => visibleIds.has(h.claim_id));
  const handoffClaimIds = new Set(pendingHandoffs.map((h) => h.claim_id));
  const firstHandoff = pendingHandoffs[0];

  const greetName = me ? doctorShortName(me.display_name ?? "", locale) : "";

  return (
    <PageContainer>
      <div className="mb-6 space-y-1.5">
        <h1 className="font-title text-3xl font-semibold text-foreground">
          {t(greetingKeyNow(), { name: greetName })}
        </h1>
      </div>

      {/* Needs-sign-off banner: counts staff hand-offs only, tappable to the
          waiting draft (matrix 4.1.4 / 3.3). */}
      {firstHandoff && (
        <Link
          href={`/forms/${firstHandoff.claim_id}/review`}
          className="mb-6 block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <Callout tone="warning" icon={<AlertIcon size={20} />}>
            <div className="flex flex-col gap-0.5">
              <p className="font-medium text-foreground">
                {t("needs-sign-off", { count: pendingHandoffs.length })}
              </p>
              <p className="text-sm text-muted-foreground">{t("needs-sign-off-hint")}</p>
            </div>
          </Callout>
        </Link>
      )}

      {error ? (
        <ErrorPanel
          title={t("error-title")}
          description={apiMessage(error)}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                overview.refetch();
                list.refetch();
              }}
            >
              {t("retry")}
            </Button>
          }
        />
      ) : loading ? (
        <div className="space-y-8">
          <section>
            <Eyebrow className="mb-3.5">{t("in-progress-heading")}</Eyebrow>
            <CardListSkeleton count={2} label={t("loading-forms")} />
          </section>
        </div>
      ) : inProgress.length === 0 && completed.length === 0 ? (
        <EmptyPanel
          icon={<FilePlusIcon size={40} />}
          title={t("empty-title")}
          description={t("empty-description")}
          action={
            <Button asChild>
              <Link href={`/forms/new`}>
                <PlusIcon size={20} aria-hidden />
                {tShell("start-form")}
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-10">
          {/* In progress */}
          <section>
            <Eyebrow className="mb-3.5">{t("in-progress-heading")}</Eyebrow>
            {inProgress.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("empty-description")}</p>
            ) : (
              /* grid-cols-1 = minmax(0,1fr): without it the implicit track
                 sizes to the cards' intrinsic min-content (truncate hides
                 overflow but does not shrink intrinsic width), overflowing
                 small viewports. */
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {inProgress.map((claim) => (
                  <InProgressCard
                    key={claim.id}
                    claim={claim}
                    locale={locale}
                    handoff={handoffClaimIds.has(claim.id)}
                    hint={hints[claim.id]}
                    companyLabel={catalog.companyName(claim.company_id, locale)}
                    formLabel={catalog.formName(claim.template_id, locale)}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Recently completed */}
          {completed.length > 0 && (
            <section>
              <Eyebrow className="mb-3.5">{t("completed-heading")}</Eyebrow>
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
                {completed.slice(0, 5).map((claim) => (
                  <CompletedRow
                    key={claim.id}
                    claim={claim}
                    locale={locale}
                    companyLabel={catalog.companyName(claim.company_id, locale)}
                    formLabel={catalog.formName(claim.template_id, locale)}
                  />
                ))}
              </div>
              <div className="mt-3">
                <Link
                  href={`/history`}
                  className="-my-1 inline-flex items-center py-1 text-sm font-medium text-[var(--link-text)] transition-colors duration-[120ms] hover:text-[var(--link-text-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t("view-all-completed")}
                </Link>
              </div>
            </section>
          )}
        </div>
      )}
    </PageContainer>
  );
}

// The in-progress card (reference DraftCard): insurer · form title, patient
// sub-line, coloured status-dot resume hint (an honest count), clock +
// relative edited time, and a needs-sign-off badge on staff hand-offs.
function InProgressCard({
  claim,
  locale,
  handoff,
  hint,
  companyLabel,
  formLabel,
}: {
  claim: ClaimListItem;
  locale: Locale;
  handoff: boolean;
  hint?: { needsInput: number; drafted: number };
  companyLabel: string;
  formLabel: string;
}) {
  const t = useTranslations("home");
  const status = useTranslations("status");

  const hintText = handoff
    ? t("hint-handoff")
    : hint && hint.needsInput > 0
      ? t("hint-needs-input", { count: hint.needsInput })
      : hint && hint.drafted > 0
        ? t("hint-drafted", { count: hint.drafted })
        : t("hint-ready");
  const hintState = handoff
    ? "drafted"
    : hint && hint.needsInput > 0
      ? "needs-input"
      : "drafted";

  return (
    <Link
      href={resumeHref(claim)}
      className={cn(
        "flex min-h-32 flex-col gap-2.5 rounded-md border border-border bg-card p-4 transition-colors duration-[120ms] hover:bg-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <p className="truncate text-base font-medium text-foreground">
            {companyLabel && formLabel
              ? `${companyLabel} · ${formLabel}`
              : companyLabel || formLabel || t("no-patient")}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {claim.patient_name ?? t("no-patient")}
          </p>
        </div>
        {handoff && (
          <ClaimStatusBadge status="AI_FILLED" label={status("AI_FILLED")} />
        )}
      </div>
      <div className="flex-1" />
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-foreground">
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ background: `var(--state-${hintState})` }}
          />
          <span className="truncate">{hintText}</span>
        </span>
        <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <ClockIcon size={13} aria-hidden />
          {relativeFromNow(claim.created_at, locale)}
        </span>
      </div>
    </Link>
  );
}

// The completed row (reference CompletedRow): insurer · form — patient, the
// FINAL date display, the status badge, and the re-download affordance.
function CompletedRow({
  claim,
  locale,
  companyLabel,
  formLabel,
}: {
  claim: ClaimListItem;
  locale: Locale;
  companyLabel: string;
  formLabel: string;
}) {
  const status = useTranslations("status");
  return (
    <Link
      href={`/forms/${claim.id}/produce`}
      className="flex items-center gap-4 px-4 py-3 text-sm transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
    >
      <div className="min-w-0 flex-1">
        <span className="font-medium text-foreground">
          {companyLabel} · {formLabel}
        </span>
        <span className="text-muted-foreground">
          {claim.patient_name ? ` — ${claim.patient_name}` : ""}
        </span>
      </div>
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatDate(claim.created_at, locale, { timeZone: "Asia/Hong_Kong" })}
      </span>
      <ClaimStatusBadge
        status={toClaimStatus(claim.status)}
        label={status(toClaimStatus(claim.status))}
      />
      <DownloadIcon
        size={18}
        className="shrink-0 text-[var(--color-glaucous)]"
        aria-hidden
      />
    </Link>
  );
}
