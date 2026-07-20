"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api/client";
import { resolveStorageUrl } from "@/lib/api/storage";
import type { CompanyBrief } from "@/lib/api/types";
import { Building2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function NewClaimSelectCompanyPage() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [keyword, setKeyword] = useState("");

  const companies = useQuery({
    queryKey: ["doctor-companies"],
    queryFn: () => apiFetch<CompanyBrief[]>("/api/doctor/insurance-companies"),
  });

  const filtered = useMemo(() => {
    const list = companies.data ?? [];
    const q = keyword.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.company_name.toLowerCase().includes(q) ||
        (c.company_name_en?.toLowerCase().includes(q) ?? false),
    );
  }, [companies.data, keyword]);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">{t("doctor.new.title")}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
          {t("doctor.new.companyDescription")}
        </p>
      </div>

      <Input
        placeholder={t("doctor.new.searchCompany")}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        className="mb-4 max-w-sm"
      />

      {companies.isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("doctor.common.loading")}</p>
      ) : filtered.length === 0 ? (
        <Card className="border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-8 text-center text-sm text-[var(--color-muted-foreground)]">
          {companies.data?.length === 0
            ? t("doctor.new.noCompanies")
            : t("doctor.new.noCompanyMatches")}
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => router.push(`/doctor/new-claim/${c.id}`)}
              className="flex items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-4 text-left shadow-[0_1px_2px_rgba(18,22,28,0.06)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-accent-soft)]"
            >
              {c.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveStorageUrl(c.logo_url)} alt="" className="h-10 w-10 rounded object-contain" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded bg-[var(--color-surface-sunken)]">
                  <Building2 className="h-5 w-5 text-[var(--color-muted-foreground)]" />
                </div>
              )}
              <div>
                <div className="text-sm font-medium">
                  {locale === "en-HK" ? c.company_name_en ?? c.company_name : c.company_name}
                </div>
                {(locale === "en-HK" ? c.company_name : c.company_name_en) && (
                  <div className="text-xs text-[var(--color-muted-foreground)]">
                    {locale === "en-HK" ? c.company_name : c.company_name_en}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
