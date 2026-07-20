"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { ClaimStatusBadge } from "@/components/shared/ClaimStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, resolveApiBaseUrl } from "@/lib/api/client";
import type { Claim } from "@/lib/api/types";
import { claimFlowUrl, resolveClaimBack } from "@/lib/doctor/utils";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

function resolveUrl(url: string): string {
  if (!url.startsWith("/local-storage")) return url;
  const base = resolveApiBaseUrl();
  return base ? `${base}${url}` : url;
}

export default function ClaimDetailPageClient({ claimId }: { claimId: number }) {
  const qc = useQueryClient();
  const searchParams = useSearchParams();
  const { locale, t } = useI18n();
  const backParam = searchParams.get("back");
  const backTarget = useMemo(() => resolveClaimBack(backParam, locale), [backParam, locale]);

  const claim = useQuery({
    queryKey: ["claim", claimId],
    queryFn: () => apiFetch<Claim>(`/api/doctor/claims/${claimId}`),
  });

  const cancelMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/doctor/claims/${claimId}/cancel`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["claim", claimId] }),
  });

  const c = claim.data;
  if (!c) return <p className="text-sm text-[var(--color-muted-foreground)]">{t("doctor.common.loading")}</p>;

  const canContinue =
    c.status === "DRAFT" || c.status === "AI_FILLED" || c.status === "CONFIRMED";

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href={backTarget.href}
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        {backTarget.label}
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t("doctor.claim.title", { number: c.submission_no })}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {t("doctor.claim.patient", { name: c.patient_name ?? t("doctor.claim.notProvided") })}
          </p>
        </div>
        <ClaimStatusBadge status={c.status} />
      </div>

      <Card className="mb-4 border-[var(--color-border)] bg-[var(--color-surface)]">
        <CardHeader>
          <CardTitle className="text-base">{t("doctor.claim.basicInfo")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-foreground)]">{t("doctor.claims.createdAt")}</span>
            <span className="tabular-nums">
              {new Date(c.created_at).toLocaleString(locale)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--color-muted-foreground)]">{t("doctor.claim.templateVersion")}</span>
            <span>{c.template_version ?? "-"}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        {canContinue && (
          <Link href={claimFlowUrl(c.id, c.status, backParam ?? undefined)}>
            <Button>{t("doctor.claim.continue")}</Button>
          </Link>
        )}
        {c.generated_pdf_url && (
          <a href={resolveUrl(c.generated_pdf_url)} target="_blank" rel="noreferrer">
            <Button variant="outline">{t("doctor.claim.viewPdf")}</Button>
          </a>
        )}
        {c.status !== "CANCELLED" && c.status !== "PRINTED" && (
          <Button
            variant="outline"
            className="text-[var(--color-destructive)]"
            onClick={() => {
              if (window.confirm(t("doctor.claim.confirmCancel"))) cancelMut.mutate();
            }}
          >
            {t("doctor.claims.cancel")}
          </Button>
        )}
      </div>
    </div>
  );
}
