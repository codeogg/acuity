"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@acuity/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, claims } from "@acuity/api-client";
import type { ClaimOut, ClaimListItem, Page } from "@acuity/types";
import {
  Button,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  DashIcon,
  HelpIcon,
  Input,
  SearchIcon,
  SendIcon,
  SparkleIcon,
  cn,
} from "@acuity/ui";
import type { Locale } from "@/i18n/routing";
import { useCatalog } from "@/lib/catalog";
import { useApi } from "@/lib/use-api";
import { useApiErrorMessage } from "@/lib/api-error";
import { Eyebrow } from "@/components/ui/page";
import { LoopScaffold } from "@/components/loop/loop-scaffold";
import { CardListSkeleton } from "@/components/ui/loaders";
import { EmptyPanel, ErrorPanel } from "@/components/ui/states";
import { useToast } from "@acuity/ui";

interface Selection {
  company_id: number;
  template_id: number;
  form_label: string;
  company_label: string;
}

interface Row {
  company_id: number;
  template_id: number;
  company: string;
  company_alt: string;
  form: string;
  form_alt: string;
  coverage: "covered" | "roadmap";
}

// Form selection (step 1). Search-first recognition over the coverage registry
// with honest covered/roadmap marking, recently-used pins + the suggested-form
// card when the search is empty, a query-echoing concierge no-match state, and
// a sticky footer stating the selection. Continue creates a DRAFT claim and
// routes into intake.

export function FormSelection() {
  const t = useTranslations("form-selection");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const catalog = useCatalog();
  const apiMessage = useApiErrorMessage();
  const { showToast } = useToast();

  // The claim history drives the honest recently-used + suggested derivations.
  const history = useApi<Page<ClaimListItem>>(() => claims.listClaims());

  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ApiError | null>(null);
  const [conciergeSent, setConciergeSent] = useState(false);

  const isZh = locale === "zh-Hant-HK";
  const loading = catalog.insurers.length === 0;

  const rows = useMemo<Row[]>(() => {
    const flat = catalog.insurers.flatMap((insurer) =>
      insurer.forms.map((form) => ({
        company_id: insurer.company_id,
        template_id: form.template_id,
        company: isZh ? insurer.company_name_zh : insurer.company_name_en,
        company_alt: isZh ? insurer.company_name_en : insurer.company_name_zh,
        form: isZh ? form.form_name_zh : form.form_name_en,
        form_alt: isZh ? form.form_name_en : form.form_name_zh,
        coverage: form.coverage,
      })),
    );
    if (!query.trim()) return flat;
    const needle = query.trim().toLowerCase();
    return flat.filter((r) =>
      [r.company, r.company_alt, r.form, r.form_alt]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [catalog.insurers, query, isZh]);

  const covered = useMemo(
    () => new Map(rows.map((r) => [`${r.company_id}-${r.template_id}`, r])),
    [rows],
  );

  // Recently-used pairs: the most recent distinct covered insurer+form pairs
  // from the clinic's own claims (an honest derivation, not a canned list).
  const recentPairs = useMemo(() => {
    const items = (history.data?.items ?? [])
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const seen = new Set<string>();
    const pairs: Row[] = [];
    for (const claim of items) {
      const key = `${claim.company_id}-${claim.template_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const row = covered.get(key);
      if (row && row.coverage === "covered") pairs.push(row);
      if (pairs.length >= 3) break;
    }
    return pairs;
  }, [history.data, covered]);

  // Suggested pair: the clinic's most frequent covered pairing.
  const suggested = useMemo(() => {
    const counts = new Map<string, number>();
    for (const claim of history.data?.items ?? []) {
      const key = `${claim.company_id}-${claim.template_id}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let best: Row | null = null;
    let bestCount = 0;
    for (const [key, count] of counts) {
      const row = covered.get(key);
      if (row && row.coverage === "covered" && count > bestCount) {
        best = row;
        bestCount = count;
      }
    }
    return best;
  }, [history.data, covered]);

  const noMatch = query.trim() !== "" && rows.length === 0;

  function select(row: Row) {
    if (row.coverage !== "covered") return;
    setSelection({
      company_id: row.company_id,
      template_id: row.template_id,
      form_label: row.form,
      company_label: row.company,
    });
  }

  function isSelected(row: Row): boolean {
    return (
      selection?.company_id === row.company_id &&
      selection?.template_id === row.template_id
    );
  }

  async function handleContinue() {
    if (!selection) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created: ClaimOut = await claims.createClaim({
        company_id: selection.company_id,
        template_id: selection.template_id,
      });
      router.push(`/forms/${created.id}/intake`);
    } catch (cause) {
      setCreateError(cause instanceof ApiError ? cause : null);
      setCreating(false);
    }
  }

  function handleConcierge() {
    setConciergeSent(true);
    showToast(t("no-match-sent"));
  }

  return (
    <LoopScaffold
      step={0}
      heading={t("step-heading")}
      confirmLeave={false}
      footerStart={
        selection
          ? t("footer-selected", {
              company: selection.company_label,
              form: selection.form_label,
            })
          : t("footer-unselected")
      }
      footerEnd={
        <Button size="lg" disabled={!selection || creating} loading={creating} onClick={handleContinue}>
          {t("continue")}
        </Button>
      }
    >
      {/* Search */}
      <div className="relative mb-6">
        <SearchIcon
          size={20}
          className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search-placeholder")}
          aria-label={t("search-placeholder")}
          className="h-12 pl-10 text-base"
        />
      </div>

      {loading ? (
        <CardListSkeleton count={4} label={t("loading-insurers")} />
      ) : (
        <>
          {/* Recently-used pins (empty-search only) */}
          {!query.trim() && recentPairs.length > 0 && (
            <div className="mb-7">
              <Eyebrow className="mb-2.5">{t("recently-used")}</Eyebrow>
              <div className="flex flex-wrap gap-2">
                {recentPairs.map((row) => {
                  const active = isSelected(row);
                  return (
                    <button
                      key={`${row.company_id}-${row.template_id}`}
                      type="button"
                      aria-pressed={active}
                      onClick={() => select(row)}
                      className={cn(
                        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors duration-[120ms]",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-foreground hover:bg-accent",
                      )}
                    >
                      <ClockIcon size={14} aria-hidden />
                      {row.company} · {row.form}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Suggested from your record (empty-search only) */}
          {!query.trim() && suggested && (
            <div className="mb-7">
              <Eyebrow className="mb-2.5">{t("suggested")}</Eyebrow>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectCard
                  row={suggested}
                  selected={isSelected(suggested)}
                  suggested
                  onSelect={() => select(suggested)}
                  t={t}
                />
              </div>
            </div>
          )}

          {noMatch ? (
            <EmptyPanel
              icon={<HelpIcon size={40} />}
              title={t("no-match-title", { query: query.trim() })}
              description={t("no-match-description")}
              action={
                conciergeSent ? (
                  <p className="inline-flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckIcon size={16} className="text-[var(--state-confirmed)]" aria-hidden />
                    {t("no-match-sent")}
                  </p>
                ) : (
                  <Button variant="secondary" onClick={handleConcierge}>
                    <SendIcon size={16} aria-hidden />
                    {t("no-match-action")}
                  </Button>
                )
              }
            />
          ) : (
            <div>
              <Eyebrow className="mb-2.5">
                {query.trim() ? t("results") : t("all-insurers")}
              </Eyebrow>
              <div className="grid gap-3 sm:grid-cols-2">
                {rows.map((row) => (
                  <SelectCard
                    key={`${row.company_id}-${row.template_id}`}
                    row={row}
                    selected={isSelected(row)}
                    onSelect={() => select(row)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {createError && (
        <div className="mt-4">
          <ErrorPanel title={t("create-error")} description={apiMessage(createError)} />
        </div>
      )}
    </LoopScaffold>
  );
}

function SelectCard({
  row,
  selected,
  suggested,
  onSelect,
  t,
}: {
  row: Row;
  selected: boolean;
  suggested?: boolean;
  onSelect: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const roadmap = row.coverage === "roadmap";
  return (
    <button
      type="button"
      disabled={roadmap}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex flex-col gap-2.5 rounded-md border bg-card p-4 text-left transition-colors duration-[120ms]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
        roadmap ? "cursor-not-allowed opacity-70" : "cursor-pointer hover:bg-accent",
        selected ? "border-primary ring-1 ring-inset ring-primary" : "border-border",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-foreground">{row.company}</p>
          <p className="truncate text-sm text-muted-foreground">{row.form}</p>
        </div>
        {selected && (
          <span
            aria-hidden
            className="flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
          >
            <CheckIcon size={13} />
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {suggested && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
            <SparkleIcon size={14} className="text-[var(--tone-info)]" aria-hidden />
            {t("suggested-marker")}
          </span>
        )}
        {roadmap ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <DashIcon size={14} className="text-[var(--state-optional)]" aria-hidden />
            {t("coverage-roadmap")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs text-foreground">
            <CheckCircleIcon size={14} className="text-[var(--state-confirmed)]" aria-hidden />
            {t("coverage-covered")}
          </span>
        )}
        {selected && (
          <span className="ml-auto text-xs font-medium text-primary">{t("selected")}</span>
        )}
      </div>
    </button>
  );
}
