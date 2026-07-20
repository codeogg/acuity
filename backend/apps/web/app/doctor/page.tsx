"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import type { Claim, HomeOverview } from "@/lib/api/types";
import { claimFlowUrl, formatRelativeTime, getGreetingPrefix } from "@/lib/doctor/utils";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Plus,
} from "lucide-react";

function StatCard({
  label,
  value,
  highlight,
  href,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  href?: string;
}) {
  const inner = (
    <Card className="flex flex-1 flex-col gap-1 border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 shadow-[0_1px_2px_rgba(18,22,28,0.06)]">
      <span className="text-sm text-[var(--color-muted-foreground)]">{label}</span>
      <span
        className={cn(
          "tabular-nums text-3xl font-semibold tracking-tight",
          highlight ? "text-[var(--color-warning)]" : "text-[var(--color-foreground)]",
        )}
      >
        {value}
      </span>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="flex flex-1 transition-opacity hover:opacity-90">
        {inner}
      </Link>
    );
  }
  return inner;
}

function DraftStatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  if (status === "AI_FILLED") {
    return (
      <span className="rounded-md bg-[var(--color-warning-soft)] px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
        {t("doctor.home.reviewFields")}
      </span>
    );
  }
  return (
    <span className="rounded-md bg-[var(--color-surface-sunken)] px-2 py-0.5 text-xs font-medium text-[var(--color-muted-foreground)]">
      {t("doctor.status.DRAFT")}
    </span>
  );
}

function RecentStatus({ status, label }: { status: string; label: string }) {
  const { t } = useI18n();
  if (status === "PRINTED") {
    return (
      <span className="flex items-center gap-1 text-xs text-[var(--color-success)]">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t("doctor.status.PRINTED")}
      </span>
    );
  }
  if (status === "AI_FILLED") {
    return (
      <span className="flex items-center gap-1 text-xs text-[var(--color-warning)]">
        <Clock className="h-3.5 w-3.5" />
        {t("doctor.status.AI_FILLED")}
      </span>
    );
  }
  return (
    <span className="text-xs text-[var(--color-muted-foreground)]">
      {status in { DRAFT: 1, AI_FILLED: 1, CONFIRMED: 1, PRINTED: 1, CANCELLED: 1 }
        ? t(`doctor.status.${status}`)
        : label}
    </span>
  );
}

export default function DoctorHomePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { locale, t } = useI18n();

  const { data, isLoading } = useQuery({
    queryKey: ["doctor-home"],
    queryFn: () => apiFetch<HomeOverview>("/api/doctor/home/overview"),
  });

  const createMut = useMutation({
    mutationFn: (body: { company_id: number; template_id: number }) =>
      apiFetch<Claim>("/api/doctor/claims", { method: "POST", body }),
    onSuccess: (claim) => {
      qc.invalidateQueries({ queryKey: ["doctor-home"] });
      router.push(claimFlowUrl(claim.id, claim.status, "/doctor"));
    },
  });

  const greeting = getGreetingPrefix(new Date(), locale);

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("doctor.home.loading")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* 问候语 + 主操作 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {greeting}, {t("doctor.home.doctorSuffix", { name: data.greeting_name })}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {data.clinic_name}
          </p>
        </div>
        <Link href="/doctor/new-claim">
          <Button className="shrink-0 gap-1.5">
            <Plus className="h-4 w-4" />
            {t("doctor.home.newClaim")}
          </Button>
        </Link>
      </div>

      {/* 统计卡片 */}
      <div className="flex gap-3">
        <StatCard label={t("doctor.home.today")} value={data.stats.today_count} />
        <StatCard
          label={t("doctor.home.pending")}
          value={data.stats.pending_draft_count}
          highlight
          href="/doctor/claims?status=AI_FILLED"
        />
        <StatCard label={t("doctor.home.month")} value={data.stats.month_total_count} />
      </div>

      {/* 未完成草稿 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">{t("doctor.home.continue")}</h2>
        {data.unfinished_drafts.length === 0 ? (
          <Card className="border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)] shadow-[0_1px_2px_rgba(18,22,28,0.06)]">
            {t("doctor.home.noDrafts")}
          </Card>
        ) : (
          <Card className="divide-y divide-[var(--color-border)] border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(18,22,28,0.06)]">
            {data.unfinished_drafts.map((draft) => (
              <Link
                key={draft.submission_id}
                href={claimFlowUrl(draft.submission_id, draft.status, "/doctor")}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-muted)]"
              >
                <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)]" />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {draft.patient_name ?? t("doctor.home.unnamedPatient")} · {draft.company_name} ·{" "}
                  {draft.template_name}
                </span>
                <DraftStatusBadge status={draft.status} />
              </Link>
            ))}
            {data.stats.pending_draft_count > 5 && (
              <Link
                href="/doctor/claims?status=DRAFT"
                className="flex items-center justify-center gap-1 px-4 py-2.5 text-xs text-[var(--color-primary)] hover:bg-[var(--color-muted)]"
              >
                {t("doctor.home.viewAll")}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </Card>
        )}
      </section>

      {/* 快捷开始 */}
      {data.quick_start_shortcuts.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">{t("doctor.home.quickStart")}</h2>
          <div className="grid grid-cols-2 gap-3">
            {data.quick_start_shortcuts.map((item) => (
              <button
                key={`${item.company_id}-${item.template_id}`}
                type="button"
                disabled={createMut.isPending}
                onClick={() =>
                  createMut.mutate({
                    company_id: item.company_id,
                    template_id: item.template_id,
                  })
                }
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-5 text-left shadow-[0_1px_2px_rgba(18,22,28,0.06)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                <div className="text-xs text-[var(--color-muted-foreground)]">
                  {item.company_name}
                </div>
                <div className="mt-1 text-sm font-medium">{item.template_name}</div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 最近填报 */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">{t("doctor.home.recent")}</h2>
        {data.recent_claims.length === 0 ? (
          <Card className="border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-6 text-center text-sm text-[var(--color-muted-foreground)] shadow-[0_1px_2px_rgba(18,22,28,0.06)]">
            {t("doctor.home.noRecent")}
          </Card>
        ) : (
          <Card className="divide-y divide-[var(--color-border)] border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(18,22,28,0.06)]">
            {data.recent_claims.map((item) => (
              <Link
                key={item.submission_id}
                href={
                  item.status === "DRAFT" || item.status === "AI_FILLED" || item.status === "CONFIRMED"
                    ? claimFlowUrl(item.submission_id, item.status, "/doctor")
                    : `/doctor/claims/${item.submission_id}`
                }
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-muted)]"
              >
                <span className="truncate text-sm">
                  {item.patient_name ?? t("doctor.home.unnamedPatient")} · {item.company_name}
                </span>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className="text-xs text-[var(--color-muted-foreground)]"
                    title={new Date(item.created_at).toLocaleString(locale)}
                  >
                    {formatRelativeTime(item.created_at, new Date(), locale)}
                  </span>
                  <RecentStatus status={item.status} label={item.status_label} />
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
