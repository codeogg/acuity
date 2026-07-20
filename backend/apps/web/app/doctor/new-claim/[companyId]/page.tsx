"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use } from "react";

import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api/client";
import type { Claim, TemplateBrief } from "@/lib/api/types";
import { claimFlowUrl } from "@/lib/doctor/utils";
import { ChevronLeft, FileText } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function NewClaimSelectTemplatePage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId: companyIdStr } = use(params);
  const companyId = Number(companyIdStr);
  const router = useRouter();
  const { t } = useI18n();

  const templates = useQuery({
    queryKey: ["doctor-templates", companyId],
    queryFn: () =>
      apiFetch<TemplateBrief[]>(
        `/api/doctor/insurance-companies/${companyId}/templates`,
      ),
  });

  const createMut = useMutation({
    mutationFn: (templateId: number) =>
      apiFetch<Claim>("/api/doctor/claims", {
        method: "POST",
        body: { company_id: companyId, template_id: templateId },
      }),
    onSuccess: (claim) => router.push(claimFlowUrl(claim.id, claim.status)),
  });

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/doctor/new-claim"
        className="mb-4 inline-flex items-center gap-1 text-sm text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
      >
        <ChevronLeft className="h-4 w-4" />
        {t("doctor.new.backCompanies")}
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold">{t("doctor.new.templateTitle")}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {t("doctor.new.templateDescription")}
        </p>
      </div>

      {templates.isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("doctor.common.loading")}</p>
      ) : templates.data?.length === 0 ? (
        <Card className="border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
          {t("doctor.new.noTemplates")}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.data?.map((template) => (
            <button
              key={template.id}
              type="button"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate(template.id)}
              className="flex items-start gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-left shadow-[0_1px_2px_rgba(18,22,28,0.06)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            >
              <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-muted-foreground)]" />
              <div>
                <div className="text-sm font-medium">{template.template_name}</div>
                <div className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  {t("doctor.new.templateMeta", {
                    version: template.version,
                    pages: template.page_count,
                  })}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
