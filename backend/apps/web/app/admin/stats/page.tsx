"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { apiFetch } from "@/lib/api/client";
import type {
  AiUsageMonthlyItem,
  AiUsageMonthlyResponse,
  Clinic,
  Page,
} from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

const PURPOSE_KEYS = new Set([
  "classify",
  "detect_visits",
  "extract_fields",
  "crosscheck",
  "suggest_extraction_hint",
]);

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatTokens(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatCost(value: string | number) {
  return `$${Number(value).toFixed(4)}`;
}

export default function StatsPage() {
  const { t } = useI18n();
  const [month, setMonth] = useState(currentMonth);
  const [clinicId, setClinicId] = useState(0);
  const [purpose, setPurpose] = useState("all");

  const clinics = useQuery({
    queryKey: ["ai-usage-clinics"],
    queryFn: () =>
      apiFetch<Page<Clinic>>("/api/admin/clinics", {
        query: { page: 1, page_size: 100 },
      }),
  });
  const usage = useQuery({
    queryKey: ["ai-usage", month, clinicId],
    queryFn: () =>
      apiFetch<AiUsageMonthlyResponse>("/api/admin/stats/ai-usage", {
        query: {
          month: month || undefined,
          clinic_id: clinicId || undefined,
        },
      }),
  });

  const purposes = useMemo(
    () => Array.from(new Set((usage.data?.items ?? []).map((item) => item.purpose))),
    [usage.data],
  );
  const rows = useMemo(
    () =>
      (usage.data?.items ?? []).filter(
        (item) => purpose === "all" || item.purpose === purpose,
      ),
    [purpose, usage.data],
  );
  const purposeTotals = useMemo(() => {
    const totals = new Map<string, { tokens: number; cost: number }>();
    for (const item of usage.data?.items ?? []) {
      const current = totals.get(item.purpose) ?? { tokens: 0, cost: 0 };
      current.tokens += item.total_tokens;
      current.cost += Number(item.estimated_cost_usd);
      totals.set(item.purpose, current);
    }
    return Array.from(totals.entries()).sort((a, b) => b[1].cost - a[1].cost);
  }, [usage.data]);

  const summary = usage.data?.summary;
  const cards = [
    [t("admin.stats.calls"), formatTokens(summary?.call_count ?? 0)],
    [t("admin.stats.inputTokens"), formatTokens(summary?.input_tokens ?? 0)],
    [t("admin.stats.outputTokens"), formatTokens(summary?.output_tokens ?? 0)],
    [t("admin.stats.estimatedCostUsd"), formatCost(summary?.estimated_cost_usd ?? 0)],
  ];

  return (
    <div>
      <PageHeader
        title={t("admin.stats.title")}
        description={t("admin.stats.description")}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardContent className="pt-5">
              <div className="text-xs text-[var(--color-muted-foreground)]">{label}</div>
              <div className="mt-1 text-2xl font-semibold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-4">
        <CardContent className="grid gap-3 pt-5 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
              {t("admin.stats.month")}
            </label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
              {t("admin.stats.clinic")}
            </label>
            <SearchableSelect
              value={clinicId}
              onChange={setClinicId}
              options={[
                { value: 0, label: t("admin.stats.allClinics") },
                ...(clinics.data?.items ?? []).map((clinic) => ({
                  value: clinic.id,
                  label: clinic.clinic_name,
                })),
              ]}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--color-muted-foreground)]">
              {t("admin.stats.purpose")}
            </label>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="h-9 w-full rounded-lg border border-[var(--color-input)] bg-transparent px-3 text-sm"
            >
              <option value="all">{t("admin.stats.allPurposes")}</option>
              {purposes.map((item) => (
                <option key={item} value={item}>
                  {PURPOSE_KEYS.has(item) ? t(`admin.stats.purpose.${item}`) : item}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {purposeTotals.length > 0 && (
        <Card className="mb-4">
          <CardContent className="pt-5">
            <div className="mb-3 text-sm font-medium">{t("admin.stats.ranking")}</div>
            <div className="flex flex-wrap gap-2">
              {purposeTotals.map(([itemPurpose, total]) => (
                <button
                  type="button"
                  key={itemPurpose}
                  onClick={() => setPurpose(itemPurpose)}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)]"
                >
                  <span className="font-medium">
                    {PURPOSE_KEYS.has(itemPurpose)
                      ? t(`admin.stats.purpose.${itemPurpose}`)
                      : itemPurpose}
                  </span>
                  <span className="ml-2 text-[var(--color-muted-foreground)]">
                    {formatTokens(total.tokens)} tokens · {formatCost(total.cost)}
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-5">
          {usage.isLoading ? (
            <div className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
              {t("admin.common.loading")}
            </div>
          ) : usage.isError ? (
            <div className="py-10 text-center text-sm text-[var(--color-destructive)]">
              {t("admin.stats.loadFailed")}
            </div>
          ) : (
            <UsageTable rows={rows} />
          )}
          <p className="mt-3 text-xs text-[var(--color-muted-foreground)]">
            {t("admin.stats.disclaimer")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function UsageTable({ rows }: { rows: AiUsageMonthlyItem[] }) {
  const { t } = useI18n();
  return (
    <Table>
      <THead>
        <TR>
          <TH>{t("admin.stats.month")}</TH>
          <TH>{t("admin.stats.clinic")}</TH>
          <TH>{t("admin.stats.model")}</TH>
          <TH>{t("admin.stats.purpose")}</TH>
          <TH className="text-right">{t("admin.stats.calls")}</TH>
          <TH className="text-right">{t("admin.stats.inputTokens")}</TH>
          <TH className="text-right">{t("admin.stats.outputTokens")}</TH>
          <TH className="text-right">{t("admin.stats.totalTokens")}</TH>
          <TH className="text-right">{t("admin.stats.estimatedCost")}</TH>
        </TR>
      </THead>
      <TBody>
        {rows.length === 0 ? (
          <TR>
            <TD colSpan={9} className="py-10 text-center text-[var(--color-muted-foreground)]">
              {t("admin.stats.empty")}
            </TD>
          </TR>
        ) : (
          rows.map((row) => (
            <TR
              key={`${row.usage_month}-${row.clinic_id}-${row.model}-${row.purpose}`}
            >
              <TD>{row.usage_month.slice(0, 7)}</TD>
              <TD>{row.clinic_name ?? t("admin.stats.unassignedClinic")}</TD>
              <TD className="font-mono text-xs">{row.model}</TD>
              <TD>
                {PURPOSE_KEYS.has(row.purpose)
                  ? t(`admin.stats.purpose.${row.purpose}`)
                  : row.purpose}
              </TD>
              <TD className="text-right">{formatTokens(row.call_count)}</TD>
              <TD className="text-right">{formatTokens(row.input_tokens)}</TD>
              <TD className="text-right">{formatTokens(row.output_tokens)}</TD>
              <TD className="text-right">{formatTokens(row.total_tokens)}</TD>
              <TD className="text-right">{formatCost(row.estimated_cost_usd)}</TD>
            </TR>
          ))
        )}
      </TBody>
    </Table>
  );
}
