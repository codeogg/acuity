"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@acuity/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  claims,
  frontendOnly,
  type ClaimListItemWithClinic,
} from "@acuity/api-client";
import type { ClaimListItem, Page } from "@acuity/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  ChevronRightIcon,
  DownloadIcon,
  Input,
  SearchIcon,
  TrashIcon,
  XIcon,
  cn,
} from "@acuity/ui";
import { formatDate } from "@acuity/i18n/format";
import type { Locale } from "@/i18n/routing";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { localeName } from "@acuity/i18n/names";
import { useApiErrorMessage } from "@/lib/api-error";
import { useCatalog } from "@/lib/catalog";
import { resumeHref, isInProgress } from "@/lib/resume";
import { PageContainer, PageHeading } from "@/components/ui/page";
import { CardListSkeleton } from "@/components/ui/loaders";
import { EmptyPanel, ErrorPanel } from "@/components/ui/states";
import { ClaimStatusBadge, toClaimStatus } from "@/components/ui/status-badge";

type StatusFilter = "all" | "DRAFT" | "AI_FILLED" | "PRINTED";

// History (WORK -> Completed). Search across patient, insurer, and form names
// (both locales), the four reference filter chips, a visible "Resume ›" cue on
// drafts, re-download, permanent delete with confirmation, and the ?patient=
// filter the patients surface links with (echoed + clearable).

export function History() {
  const t = useTranslations("history");
  const locale = useLocale() as Locale;
  const apiMessage = useApiErrorMessage();
  const catalog = useCatalog();
  const { mergedWorkspace } = useSession();
  const searchParams = useSearchParams();
  const patientParam = searchParams.get("patient");

  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [patientFilter, setPatientFilter] = useState<string | null>(patientParam);

  const list = useApi<Page<ClaimListItem>>(() => claims.listClaims(), []);

  const filtered = useMemo(() => {
    let items = list.data?.items ?? [];
    if (patientFilter) {
      items = items.filter((c) => c.patient_name === patientFilter);
    }
    if (status !== "all") items = items.filter((c) => c.status === status);
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      items = items.filter((c) =>
        [
          c.patient_name ?? "",
          c.submission_no,
          catalog.companyName(c.company_id, "en-HK"),
          catalog.companyName(c.company_id, "zh-Hant-HK"),
          catalog.formName(c.template_id, "en-HK"),
          catalog.formName(c.template_id, "zh-Hant-HK"),
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    return items;
  }, [list.data, status, query, patientFilter, catalog]);

  const hasFilters = query.trim() !== "" || status !== "all" || patientFilter !== null;

  async function handleDelete(id: number) {
    try {
      await frontendOnly.claimExtensions.deleteClaim(id);
      list.refetch();
    } catch {
      /* surfaced by the row on next load */
    }
  }

  // Keyboard ergonomics for the repeat re-download/resume loop: "/" focuses
  // the search, j/k (or arrows) traverse rows, Enter opens the focused row
  // (native link activation). Keys are inert while typing; pointer and Tab
  // parity always remain.
  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    if (event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);
    if (event.key === "/" && !typing) {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (typing) return;
    if (["j", "k", "ArrowDown", "ArrowUp"].includes(event.key)) {
      const rows = Array.from(
        listRef.current?.querySelectorAll<HTMLElement>("[data-history-row]") ?? [],
      );
      if (rows.length === 0) return;
      const index = rows.findIndex((row) => row === document.activeElement);
      const forward = event.key === "j" || event.key === "ArrowDown";
      const next =
        index < 0
          ? 0
          : forward
            ? Math.min(index + 1, rows.length - 1)
            : Math.max(index - 1, 0);
      event.preventDefault();
      rows[next]?.focus();
      rows[next]?.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const statusLabels: Record<StatusFilter, string> = {
    all: t("filter-all"),
    DRAFT: t("filter-draft"),
    AI_FILLED: t("filter-needs-sign-off"),
    PRINTED: t("filter-submitted"),
  };
  const activeFilterEcho = [
    query.trim() && `"${query.trim()}"`,
    status !== "all" && statusLabels[status],
    patientFilter,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageContainer>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- keyboard
          shortcut delegation ("/" to search, j/k over the native row links); the
          wrapper is never a tab stop and all children are native controls. */}
      <div onKeyDown={handleKeyDown}>
      <PageHeading eyebrow={t("eyebrow")} title={t("heading")} />

      {/* Search */}
      <div className="relative mb-4">
        <SearchIcon
          size={20}
          className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search-placeholder")}
          aria-label={t("search-placeholder")}
          className="h-12 pl-10 text-base"
        />
      </div>

      {/* Filter chips + the patient filter echo */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(
          [
            ["all", t("filter-all")],
            ["PRINTED", t("filter-submitted")],
            ["DRAFT", t("filter-draft")],
            ["AI_FILLED", t("filter-needs-sign-off")],
          ] as [StatusFilter, string][]
        ).map(([value, label]) => {
          const active = status === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(value)}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm transition-colors duration-[120ms]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                active
                  ? "border-primary bg-muted text-primary"
                  : "border-border bg-card text-foreground hover:bg-accent",
              )}
            >
              {label}
            </button>
          );
        })}
        {patientFilter && (
          <button
            type="button"
            onClick={() => setPatientFilter(null)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary bg-muted px-3.5 text-sm text-primary transition-colors duration-[120ms] hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("patient-filter", { patient: patientFilter })}
            <XIcon size={14} aria-hidden />
          </button>
        )}
      </div>

      {list.error ? (
        <ErrorPanel
          title={t("error-title")}
          description={apiMessage(list.error)}
          action={
            <Button variant="outline" size="sm" onClick={list.refetch}>
              {t("retry")}
            </Button>
          }
        />
      ) : list.loading ? (
        <CardListSkeleton count={4} label={t("loading-forms")} />
      ) : filtered.length === 0 ? (
        hasFilters ? (
          <EmptyPanel
            title={t("no-results-title")}
            description={
              activeFilterEcho ? t("no-results-filters", { filters: activeFilterEcho }) : undefined
            }
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setStatus("all");
                  setPatientFilter(null);
                }}
              >
                {t("clear-filters")}
              </Button>
            }
          />
        ) : (
          <EmptyPanel title={t("empty-title")} description={t("empty-description")} />
        )
      ) : (
        <div
          ref={listRef}
          className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card"
        >
          {filtered.map((claim) => (
            <HistoryRow
              key={claim.id}
              claim={claim}
              locale={locale}
              companyLabel={catalog.companyName(claim.company_id, locale)}
              formLabel={catalog.formName(claim.template_id, locale)}
              // ADR 0041 §6: a merged workspace mixes clinics in one list, so
              // each row names its clinic (attribution rides the list items).
              clinicLabel={
                mergedWorkspace
                  ? clinicRowLabel(claim as ClaimListItemWithClinic, locale)
                  : null
              }
              onDelete={() => handleDelete(claim.id)}
            />
          ))}
        </div>
      )}
      </div>
    </PageContainer>
  );
}

function clinicRowLabel(
  claim: ClaimListItemWithClinic,
  locale: Locale,
): string | null {
  return claim.clinic_name ? localeName(claim.clinic_name, locale) : null;
}

function HistoryRow({
  claim,
  locale,
  companyLabel,
  formLabel,
  clinicLabel,
  onDelete,
}: {
  claim: ClaimListItem;
  locale: Locale;
  companyLabel: string;
  formLabel: string;
  clinicLabel: string | null;
  onDelete: () => void;
}) {
  const t = useTranslations("history");
  const status = useTranslations("status");
  const claimStatus = toClaimStatus(claim.status);
  const resumable = isInProgress(claim.status);
  const completed = claimStatus === "PRINTED" || claimStatus === "CONFIRMED";
  const target = resumeHref(claim);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link
        href={target}
        data-history-row
        className="min-w-0 flex-1 rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <p className="truncate text-sm font-medium text-foreground">
          {claim.patient_name ?? t("no-patient")}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {clinicLabel ? `${clinicLabel} · ` : ""}
          {companyLabel} · {formLabel}
        </p>
      </Link>

      <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
        {formatDate(claim.created_at, locale, { timeZone: "Asia/Hong_Kong" })}
      </span>

      <ClaimStatusBadge status={claimStatus} label={status(claimStatus)} />

      <div className="flex shrink-0 items-center gap-0.5">
        {resumable && (
          <Link
            href={target}
            className="hidden items-center gap-0.5 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          >
            {t("resume")}
            <ChevronRightIcon size={13} aria-hidden />
          </Link>
        )}
        {completed && (
          <Link
            href={target}
            aria-label={t("re-download")}
            title={t("re-download")}
            className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <DownloadIcon size={18} />
          </Link>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              type="button"
              aria-label={t("delete")}
              title={t("delete")}
              className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            >
              <TrashIcon size={18} />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("delete-confirm-title")}</AlertDialogTitle>
              <AlertDialogDescription>{t("delete-confirm-body")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("delete-cancel")}</AlertDialogCancel>
              <AlertDialogAction variant="destructive" onClick={onDelete}>
                {t("delete-confirm-action")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
