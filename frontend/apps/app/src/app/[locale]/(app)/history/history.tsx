"use client";

import { useCallback, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@acuity/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  claims,
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
  useToast,
} from "@acuity/ui";
import { formatDate } from "@acuity/i18n/format";
import type { Locale } from "@/i18n/routing";
import { useApi } from "@/lib/use-api";
import { useSession } from "@/lib/session";
import { localeName } from "@acuity/i18n/names";
import { useApiErrorMessage } from "@/lib/api-error";
import { useCatalog } from "@/lib/catalog";
import { formatPatientDisplay } from "@/lib/patient-name";
import { isInProgress, resumeHref } from "@/lib/resume";
import { PageContainer, PageHeading } from "@/components/ui/page";
import { CardListSkeleton } from "@/components/ui/loaders";
import { EmptyPanel, ErrorPanel } from "@/components/ui/states";
import { ClaimStatusBadge, toClaimStatus } from "@/components/ui/status-badge";

type ClaimListRow = ClaimListItem & {
  company_name?: string | null;
  company_name_en?: string | null;
  template_name?: string | null;
  patient_name_cn?: string | null;
  patient_name_en?: string | null;
};

function claimCompanyLabel(claim: ClaimListRow, locale: Locale, fallback: string): string {
  if (locale === "zh-Hant-HK") {
    return claim.company_name?.trim() || claim.company_name_en?.trim() || fallback;
  }
  return claim.company_name_en?.trim() || claim.company_name?.trim() || fallback;
}

function claimFormLabel(claim: ClaimListRow, fallback: string): string {
  return claim.template_name?.trim() || fallback;
}

// History (WORK -> Completed). Lists printed (PRINTED) claims from the live API.
// Search across patient / insurer / form names; ?patient= filter from patients.

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
  const [patientFilter, setPatientFilter] = useState<string | null>(patientParam);

  const list = useApi<Page<ClaimListRow>>(
    () => claims.listCompletedClaims({ page_size: 50 }),
    [],
  );
  const { showToast } = useToast();

  const filtered = useMemo(() => {
    let items = list.data?.items ?? [];
    if (patientFilter) {
      items = items.filter((c) => formatPatientDisplay(c) === patientFilter);
    }
    if (query.trim()) {
      const needle = query.trim().toLowerCase();
      items = items.filter((c) =>
        [
          formatPatientDisplay(c),
          c.patient_name_cn ?? "",
          c.patient_name_en ?? "",
          c.patient_name ?? "",
          c.submission_no,
          claimCompanyLabel(c, "en-HK", ""),
          claimCompanyLabel(c, "zh-Hant-HK", ""),
          claimFormLabel(c, ""),
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
  }, [list.data, query, patientFilter, catalog]);

  const hasFilters = query.trim() !== "" || patientFilter !== null;

  async function handleDelete(id: number) {
    try {
      await claims.deleteClaim(id);
      showToast(t("delete-success"));
      list.refetch();
    } catch {
      showToast(t("delete-failed"));
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

  const activeFilterEcho = [query.trim() && `"${query.trim()}"`, patientFilter]
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

      {patientFilter ? (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPatientFilter(null)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary bg-muted px-3.5 text-sm text-primary transition-colors duration-[120ms] hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t("patient-filter", { patient: patientFilter })}
            <XIcon size={14} aria-hidden />
          </button>
        </div>
      ) : null}

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
              companyLabel={claimCompanyLabel(
                claim,
                locale,
                catalog.companyName(claim.company_id, locale),
              )}
              formLabel={claimFormLabel(
                claim,
                catalog.formName(claim.template_id, locale),
              )}
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
  claim: ClaimListRow;
  locale: Locale;
  companyLabel: string;
  formLabel: string;
  clinicLabel: string | null;
  onDelete: () => void;
}) {
  const t = useTranslations("history");
  const status = useTranslations("status");
  const { showToast } = useToast();
  const claimStatus = toClaimStatus(claim.status);
  const resumable = isInProgress(claim.status);
  const completed = claimStatus === "PRINTED" || claimStatus === "CONFIRMED";
  const target = resumeHref(claim);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    try {
      try {
        await claims.downloadClaimFormPdf(claim.id, `${claim.submission_no}.pdf`);
      } catch {
        // PDF may be missing — regenerate then retry once.
        await claims.generateClaimPdf(claim.id);
        await claims.downloadClaimFormPdf(claim.id, `${claim.submission_no}.pdf`);
      }
    } catch {
      showToast(t("download-failed"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link
        href={target}
        data-history-row
        className="min-w-0 flex-1 rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <p className="truncate text-sm font-medium text-foreground">
          {formatPatientDisplay(claim) || t("no-patient")}
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
          <button
            type="button"
            aria-label={t("re-download")}
            title={t("re-download")}
            disabled={downloading}
            onClick={() => void handleDownload()}
            className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
          >
            <DownloadIcon size={18} />
          </button>
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
