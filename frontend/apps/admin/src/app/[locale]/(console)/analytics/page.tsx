// Analytics — the lean operator report set (aggregates only, no PHI): usage
// over time, activation funnel, verify pass-vs-fail, extraction confidence +
// correction rate, error trend; dimension + range selectors and the logged
// surrogate-only export. Every chart states its aggregation basis beside the
// title, and an empty window renders an honest zero-state, never a blank
// chart.

import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { MetaBadge } from "@/components/ui/status-badge";
import { CardSkeleton } from "@/components/ui/skeletons";
import { UrlSelect } from "@/components/grid/filter-bar";
import { Bars, SplitBar, Sparkline } from "@/components/ui/charts";
import { ActionButton } from "@/components/ui/action-button";
import { exportAnalyticsAction } from "@/lib/actions";
import {
  getActivationFunnel,
  getQualityReport,
  getUsageSeries,
  getVerificationReport,
} from "@/lib/data";

type Search = { dim?: string; range?: string };

function Card({
  title,
  sub,
  basis,
  children,
}: {
  title: string;
  sub?: string;
  /** Aggregation basis stated on the chart ("per clinic, excludes archived"). */
  basis?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-1 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
        {title}
      </div>
      {sub ? <div className="mb-1 text-xs text-muted-foreground">{sub}</div> : null}
      {basis ? <div className="mb-3 text-xs text-muted-foreground">{basis}</div> : null}
      {children}
    </div>
  );
}

function ZeroState({ text }: { text: string }) {
  return (
    <p className="flex h-28 items-center justify-center text-sm text-muted-foreground">{text}</p>
  );
}

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations("analytics");

  return (
    <div className="flex h-full flex-col">
      <SectionTopBar
        eyebrow={t("eyebrow")}
        title={t("title")}
        action={
          <div className="flex items-center gap-2">
            <UrlSelect
              param="dim"
              label={t("dim-label")}
              allLabel={t("dim-clinic")}
              width="9rem"
              options={[
                { value: "doctor", label: t("dim-doctor") },
                { value: "form", label: t("dim-form") },
              ]}
            />
            <UrlSelect
              param="range"
              label={t("range-label")}
              allLabel={t("range-30d")}
              width="9rem"
              options={[
                { value: "7d", label: t("range-7d") },
                { value: "90d", label: t("range-90d") },
              ]}
            />
            <ActionButton
              label={t("export")}
              icon="download"
              action={exportAnalyticsAction.bind(null, "usage")}
              successMessage={t("exported")}
            />
          </div>
        }
      />
      {/* Charts hold no focusable content, so the scroll container is the
          keyboard stop (scrollable-region-focusable). */}
      <div
        role="region"
        aria-label={t("title")}
        tabIndex={0}
        className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Suspense fallback={<CardSkeleton height={240} />}>
              <UsageCard dim={sp.dim} range={sp.range} />
            </Suspense>
          </div>
          <Suspense fallback={<CardSkeleton height={220} />}>
            <FunnelCard />
          </Suspense>
          <Suspense fallback={<CardSkeleton height={220} />}>
            <VerifyCard />
          </Suspense>
          <Suspense fallback={<CardSkeleton height={220} />}>
            <QualityCard />
          </Suspense>
          <Suspense fallback={<CardSkeleton height={220} />}>
            <ErrorTrendCard />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function UsageCard({ dim, range }: { dim?: string; range?: string }) {
  const rangeDays = range === "7d" ? 7 : range === "90d" ? 90 : 30;
  const [t, usage] = await Promise.all([getTranslations("analytics"), getUsageSeries({ range_days: rangeDays })]);
  const dimLabel = dim === "doctor" ? t("dim-doctor") : dim === "form" ? t("dim-form") : t("dim-clinic");
  const empty = usage.length === 0 || usage.every((p) => p.count === 0);
  return (
    <Card
      title={t("usage-title")}
      sub={`${dimLabel} · ${t(`range-${range === "7d" ? "7d" : range === "90d" ? "90d" : "30d"}`)}`}
      basis={t("usage-basis")}
    >
      {empty ? (
        <ZeroState text={t("zero-window")} />
      ) : (
        <Bars
          data={usage.map((p) => p.count)}
          labels={usage.map((p) => p.date.slice(5))}
        />
      )}
    </Card>
  );
}

async function FunnelCard() {
  const [t, funnel] = await Promise.all([getTranslations("analytics"), getActivationFunnel()]);
  const rows = [
    { label: t("funnel-provisioning"), value: funnel.provisioning, hue: "var(--caliber-steel-grey)" },
    { label: t("funnel-onboarding"), value: funnel.onboarding, hue: "var(--caliber-glaucous)" },
    { label: t("funnel-active"), value: funnel.active, hue: "var(--caliber-sage)" },
  ];
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <Card title={t("funnel-title")} basis={t("funnel-basis")}>
      <div className="mt-2 space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-foreground">{row.label}</span>
              <span className="font-semibold tabular-nums">{row.value}</span>
            </div>
            <div className="h-2.5 rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(row.value / max) * 100}%`,
                  background: `color-mix(in srgb, ${row.hue} 60%, transparent)`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

async function VerifyCard() {
  const [t, report] = await Promise.all([getTranslations("analytics"), getVerificationReport()]);
  const passPct = Math.round((report.pass / Math.max(report.pass + report.fail, 1)) * 100);
  if (report.pass + report.fail === 0) {
    return (
      <Card title={t("verify-title")} basis={t("verify-basis")}>
        <ZeroState text={t("zero-window")} />
      </Card>
    );
  }
  return (
    <Card title={t("verify-title")} basis={t("verify-basis")}>
      <div className="mt-3">
        <SplitBar leftPct={passPct} leftHue="var(--caliber-sage)" rightHue="var(--caliber-cranberry)" />
        <div className="mt-3 flex gap-2.5">
          <MetaBadge
            meta={{ tone: "success", icon: "check", key: "" }}
            label={t("verify-pass", { count: report.pass, pct: passPct })}
          />
          <MetaBadge meta={{ tone: "danger", icon: "alert", key: "" }} label={t("verify-fail", { count: report.fail })} />
        </div>
      </div>
    </Card>
  );
}

async function QualityCard() {
  const [t, quality] = await Promise.all([getTranslations("analytics"), getQualityReport()]);
  return (
    <Card
      title={t("quality-title")}
      sub={t("quality-sub", { rate: Math.round(quality.correction_rate * 100) })}
      basis={t("quality-basis")}
    >
      {quality.trend.length === 0 ? (
        <ZeroState text={t("zero-window")} />
      ) : (
        <Sparkline data={quality.trend.map((p) => Math.round(p.avg_confidence * 100))} hue="var(--caliber-eucalyptus)" height={110} />
      )}
    </Card>
  );
}

async function ErrorTrendCard() {
  // No dedicated error-trend aggregate exists yet; the trend derives from the
  // quality report's correction rate (presentation-level, pending backend).
  const [t, quality] = await Promise.all([getTranslations("analytics"), getQualityReport()]);
  return (
    <Card title={t("errors-title")} sub={t("errors-sub")} basis={t("errors-basis")}>
      {quality.trend.length === 0 ? (
        <ZeroState text={t("zero-window")} />
      ) : (
        <Bars
          data={quality.trend.map((p) => Math.round(p.correction_rate * 100))}
          labels={quality.trend.map((p) => p.date.slice(5))}
          hue="var(--caliber-cranberry)"
        />
      )}
    </Card>
  );
}
