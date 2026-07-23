"use client";

import { useMemo, useState } from "react";
import { Link } from "@acuity/i18n/navigation";
import { useRouter } from "@acuity/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { claims } from "@acuity/api-client";
import type { ClaimListItem, Page } from "@acuity/types";
import {
  AlertIcon,
  Button,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon,
  Input,
  PlusIcon,
  SearchIcon,
  StatusBadge,
  cn,
} from "@acuity/ui";
import type { Locale } from "@/i18n/routing";
import { useApi } from "@/lib/use-api";
import { useApiErrorMessage } from "@/lib/api-error";
import { relativeFromNow } from "@/lib/clock";
import { PageContainer, PageHeading } from "@/components/ui/page";
import { CardListSkeleton } from "@/components/ui/loaders";
import { EmptyPanel, ErrorPanel } from "@/components/ui/states";
import { Avatar } from "@acuity/ui";

// A patient derived from the forms attributed to them (never a demographics
// store). Thin index into the clinic's forms.
interface PatientRow {
  name: string;
  formCount: number;
  needsSignOff: number;
  inProgress: number;
  mostRecent: string;
  latestClaimId: number;
}

type PatientFilter = "all" | "in-progress" | "needs-sign-off";

function derivePatients(items: ClaimListItem[]): PatientRow[] {
  const byName = new Map<string, PatientRow>();
  for (const claim of items) {
    const name = claim.patient_name ?? "—";
    const existing =
      byName.get(name) ??
      {
        name,
        formCount: 0,
        needsSignOff: 0,
        inProgress: 0,
        mostRecent: claim.created_at,
        latestClaimId: claim.id,
      };
    existing.formCount += 1;
    if (claim.status === "AI_FILLED") existing.needsSignOff += 1;
    if (claim.status === "DRAFT" || claim.status === "AI_FILLED" || claim.status === "CONFIRMED") {
      existing.inProgress += 1;
    }
    if (claim.created_at >= existing.mostRecent) {
      existing.mostRecent = claim.created_at;
      existing.latestClaimId = claim.id;
    }
    byName.set(name, existing);
  }
  return Array.from(byName.values()).sort((a, b) =>
    b.mostRecent.localeCompare(a.mostRecent),
  );
}

// Patients (PATIENTS -> Patients). A searchable, filterable patient index;
// opening a patient shows their forms (history pre-filtered by ?patient=), and
// "start a form for this patient" pre-links the patient by reusing their most
// recent claim (the contract's reuse-for-template op).

export function Patients() {
  const t = useTranslations("patients");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const apiMessage = useApiErrorMessage();

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PatientFilter>("all");
  const [startingFor, setStartingFor] = useState<string | null>(null);
  const list = useApi<Page<ClaimListItem>>(() => claims.listClaims(), []);

  const patients = useMemo(() => {
    let derived = derivePatients(list.data?.items ?? []);
    if (filter === "in-progress") derived = derived.filter((p) => p.inProgress > 0);
    if (filter === "needs-sign-off") derived = derived.filter((p) => p.needsSignOff > 0);
    if (!query.trim()) return derived;
    const needle = query.trim().toLowerCase();
    return derived.filter((p) => p.name.toLowerCase().includes(needle));
  }, [list.data, query, filter]);

  // Start a pre-linked form: reuse the patient's latest claim so the patient
  // (and any transferable values) carry into the new draft.
  async function startForPatient(patient: PatientRow) {
    setStartingFor(patient.name);
    try {
      const items = list.data?.items ?? [];
      const latest = items.find((c) => c.id === patient.latestClaimId);
      const result = await claims.reuseClaimForTemplate(patient.latestClaimId, {
        new_template_id: latest?.template_id ?? 101,
      });
      router.push(`/forms/${result.submission_id}/intake`);
    } catch {
      setStartingFor(null);
      router.push(`/forms/new`);
    }
  }

  return (
    <PageContainer>
      <PageHeading eyebrow={t("eyebrow")} title={t("heading")} />

      <div className="relative mb-4">
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

      {/* Filter chips (optional per spec; the keys ship, so does the UI). */}
      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ["all", t("filter-all")],
            ["in-progress", t("filter-in-progress")],
            ["needs-sign-off", t("filter-needs-sign-off")],
          ] as [PatientFilter, string][]
        ).map(([value, label]) => {
          const active = filter === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(value)}
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
        <CardListSkeleton count={4} label={t("loading")} />
      ) : patients.length === 0 ? (
        query.trim() || filter !== "all" ? (
          <EmptyPanel
            title={t("no-results-title", { query: query.trim() })}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                {t("clear-search")}
              </Button>
            }
          />
        ) : (
          <EmptyPanel title={t("empty-title")} description={t("empty-description")} />
        )
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-card">
          {patients.map((patient) => {
            // Status badge (colour + text) — beside the name at sm+, on an
            // indented second row below sm (the labels otherwise starve the
            // name link down to a sliver; same pattern as the drawer rows).
            const statusBadge =
              patient.needsSignOff > 0 ? (
                <StatusBadge
                  tone="warning"
                  appearance="outline"
                  icon={<AlertIcon size={13} />}
                  label={t("status-needs-sign-off", { count: patient.needsSignOff })}
                />
              ) : patient.inProgress > 0 ? (
                <StatusBadge
                  tone="info"
                  appearance="outline"
                  icon={<ClockIcon size={13} />}
                  label={t("status-in-progress")}
                />
              ) : (
                <StatusBadge
                  tone="success"
                  appearance="outline"
                  icon={<CheckCircleIcon size={13} />}
                  label={t("status-up-to-date")}
                />
              );
            return (
            <div key={patient.name} className="flex items-center gap-3.5 px-4 py-3">
              <Avatar name={patient.name} size={36} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/history?patient=${encodeURIComponent(patient.name)}`}
                  className="block min-w-0 rounded-md py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                >
                  <p className="truncate text-base font-medium text-foreground">
                    {patient.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("row-meta", {
                      count: patient.formCount,
                      when: relativeFromNow(patient.mostRecent, locale),
                    })}
                  </p>
                </Link>
                <div className="mt-1 sm:hidden">{statusBadge}</div>
              </div>

              <span className="hidden sm:block">{statusBadge}</span>

              <button
                type="button"
                onClick={() => void startForPatient(patient)}
                disabled={startingFor !== null}
                aria-label={t("start-form-for-patient")}
                title={t("start-form-for-patient")}
                className={cn(
                  "flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[120ms] hover:bg-accent",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  startingFor === patient.name && "opacity-60",
                )}
              >
                <PlusIcon size={18} />
              </button>

              <Link
                href={`/history?patient=${encodeURIComponent(patient.name)}`}
                aria-label={t("open-patient", { patient: patient.name })}
                className="flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                <ChevronRightIcon size={18} />
              </Link>
            </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
