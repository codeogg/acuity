// Dashboard — glanceable ops health (non-grid surface): active clinics +
// activation funnel, forms processed with the verify pass/fail split,
// templates awaiting confirmation (→ intake worklist), the needs-attention
// worklist, and the AI-extraction quality trend. Each region loads
// independently behind its own card-shaped skeleton; the time-window selector
// drives a server re-render via the `window` search param.

import Link from "next/link";
import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { MetaBadge } from "@/components/ui/status-badge";
import { CardSkeleton } from "@/components/ui/skeletons";
import { FunnelBar, Sparkline } from "@/components/ui/charts";
import { AcuityIcon } from "@acuity/ui";
import { UrlSelect } from "@/components/grid/filter-bar";
import {
  getAnalyticsOverview,
  getDashboardGlance,
  getQualityReport,
  getWorklist,
  listTemplateRows,
} from "@/lib/data";
import type { StatusMeta } from "@/lib/status";

const AWAITING_META: StatusMeta = { tone: "info", icon: "clock", key: "status.awaiting" };
const WORKLIST_META: Record<string, StatusMeta> = {
  "status.needs-attention": { tone: "warning", icon: "alert", key: "status.needs-attention" },
  "status.overdue": { tone: "danger", icon: "alert", key: "status.overdue" },
  "status.confidence-low": { tone: "danger", icon: "alert", key: "status.confidence-low" },
  "status.failed": { tone: "danger", icon: "alert", key: "status.failed" },
  "status.open": { tone: "warning", icon: "dot", key: "status.open" },
  "status.awaiting": AWAITING_META,
};

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-lg border border-border bg-card p-6 ${className ?? ""}`}>{children}</div>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
      {children}
    </div>
  );
}

function BigFigure({ children }: { children: React.ReactNode }) {
  return <div className="font-title text-4xl font-semibold leading-tight text-foreground">{children}</div>;
}

async function ClinicsCard({ locale }: { locale: string }) {
  const [t, glance] = await Promise.all([getTranslations("dashboard"), getDashboardGlance()]);
  const funnel = glance.funnel;
  return (
    <Card>
      <Eyebrow>{t("active-clinics")}</Eyebrow>
      <BigFigure>{glance.active_clinics}</BigFigure>
      <div className="mb-2.5 mt-4">
        <FunnelBar
          segments={[
            { value: funnel.provisioning, hue: "var(--caliber-steel-grey)" },
            { value: funnel.onboarding, hue: "var(--caliber-glaucous)" },
            { value: funnel.active, hue: "var(--caliber-sage)" },
          ]}
        />
      </div>
      <div className="flex gap-2">
        {(
          [
            ["funnel-provisioning", funnel.provisioning],
            ["funnel-onboarding", funnel.onboarding],
            ["funnel-active", funnel.active],
          ] as const
        ).map(([key, value]) => (
          <Link key={key} href={`/${locale}/clinics?tab=${key.replace("funnel-", "") === "active" ? "active" : key.replace("funnel-", "")}`} className="min-w-0 flex-1 rounded-sm hover:bg-accent">
            <div className="text-base font-semibold tabular-nums text-foreground">{value}</div>
            <div className="truncate text-xs text-muted-foreground">{t(key)}</div>
          </Link>
        ))}
      </div>
    </Card>
  );
}

async function FormsCard({ window: win }: { window: string }) {
  const [t, overview] = await Promise.all([getTranslations("dashboard"), getAnalyticsOverview()]);
  const value = win === "today" ? overview.forms_processed_today : overview.forms_processed_7d;
  const passPct = Math.round(
    (overview.verify_pass_7d / Math.max(overview.verify_pass_7d + overview.verify_fail_7d, 1)) * 100,
  );
  return (
    <Card>
      <Eyebrow>{t(win === "today" ? "forms-processed-today" : "forms-processed-7d")}</Eyebrow>
      <BigFigure>{value}</BigFigure>
      <div className="mt-4 flex flex-wrap gap-2">
        <MetaBadge
          meta={{ tone: "success", icon: "check", key: "" }}
          label={t("verify-pass", { count: overview.verify_pass_7d, pct: passPct })}
        />
        <MetaBadge
          meta={{ tone: "danger", icon: "alert", key: "" }}
          label={t("verify-fail", { count: overview.verify_fail_7d })}
        />
      </div>
    </Card>
  );
}

async function AwaitingCard({ locale }: { locale: string }) {
  const [t, rows] = await Promise.all([getTranslations("dashboard"), listTemplateRows()]);
  const awaiting = rows.filter((r) => ["processed", "draft"].includes(r.ops_status)).length;
  return (
    <Link href={`/${locale}/forms?tab=intake`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="transition-colors hover:bg-accent">
        <Eyebrow>{t("awaiting-confirmation")}</Eyebrow>
        <BigFigure>{awaiting}</BigFigure>
        <div className="mt-1 text-sm text-muted-foreground">{t("open-intake")} →</div>
      </Card>
    </Link>
  );
}

async function WorklistCard({ locale }: { locale: string }) {
  const [t, tRoot, worklist] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations(),
    getWorklist(),
  ]);
  return (
    <Card>
      <Eyebrow>{t("needs-attention")}</Eyebrow>
      {worklist.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("nothing-needs-attention")}</p>
      ) : (
        <div>
          {worklist.map((item, i) => (
            <Link
              key={`${item.kind}-${item.target}-${i}`}
              href={`/${locale}${item.href}`}
              className={`-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent ${
                i < worklist.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <MetaBadge meta={WORKLIST_META[item.status_key] ?? AWAITING_META} label={tRoot(item.status_key)} />
              <span className="flex-1 text-sm text-foreground">
                {t(item.label_key, item.label_args)}
              </span>
              <span className="font-mono text-xs text-muted-foreground">{item.target}</span>
              <span className="flex text-muted-foreground">
                <AcuityIcon name="chevron-right" size={16} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

async function QualityCard() {
  const [t, quality] = await Promise.all([getTranslations("dashboard"), getQualityReport()]);
  const trend = quality.trend.map((p) => Math.round(p.avg_confidence * 100));
  const latest = trend[trend.length - 1] ?? Math.round(quality.avg_confidence * 100);
  const first = trend[0] ?? latest;
  const delta = latest - first;
  return (
    <Card>
      <Eyebrow>{t("extraction-quality")}</Eyebrow>
      <div className="mb-3 flex items-baseline gap-2.5">
        <span className="font-title text-3xl font-semibold text-foreground">{latest}%</span>
        <MetaBadge
          meta={{ tone: delta >= 0 ? "success" : "danger", icon: delta >= 0 ? "chevron-up" : "chevron-down", key: "" }}
          label={t("trend-delta", { delta: `${delta >= 0 ? "+" : ""}${delta}` })}
        />
      </div>
      <Sparkline data={trend} hue="var(--caliber-eucalyptus)" />
      <div className="mt-2 text-xs text-muted-foreground">{t("trend-caption")}</div>
    </Card>
  );
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ window?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { window: winParam } = await searchParams;
  const win = winParam === "today" || winParam === "30d" ? winParam : "7d";
  const t = await getTranslations("dashboard");

  return (
    <div className="flex h-full flex-col">
      <SectionTopBar
        eyebrow={t("eyebrow")}
        title={t("title")}
        action={
          <UrlSelect
            param="window"
            label={t("window-label")}
            allLabel={t("window-7d")}
            width="10rem"
            options={[
              { value: "today", label: t("window-today") },
              { value: "30d", label: t("window-30d") },
            ]}
          />
        }
      />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Suspense fallback={<CardSkeleton height={190} />}>
            <ClinicsCard locale={locale} />
          </Suspense>
          <Suspense fallback={<CardSkeleton height={190} />}>
            <FormsCard window={win} />
          </Suspense>
          <Suspense fallback={<CardSkeleton height={190} />}>
            <AwaitingCard locale={locale} />
          </Suspense>
          <div className="md:col-span-2">
            <Suspense fallback={<CardSkeleton height={260} />}>
              <WorklistCard locale={locale} />
            </Suspense>
          </div>
          <Suspense fallback={<CardSkeleton height={260} />}>
            <QualityCard />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
