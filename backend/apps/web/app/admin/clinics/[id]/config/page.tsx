"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type {
  Clinic,
  ClinicConfigOverview,
  CompanyConfigItem,
} from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

type Toast = { id: number; message: string; type: "success" | "error" };

function formatDate(value: string | null): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function ClinicConfigPage() {
  const { t } = useI18n();
  const translate = t;
  const params = useParams<{ id: string }>();
  const clinicId = Number(params.id);
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const queryKey = useMemo(() => ["clinic-config", clinicId], [clinicId]);

  const { data: clinic } = useQuery({
    queryKey: ["clinic", clinicId],
    queryFn: () => apiFetch<Clinic>(`/api/admin/clinics/${clinicId}`),
    enabled: Number.isFinite(clinicId),
  });

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      apiFetch<ClinicConfigOverview>(
        `/api/admin/clinics/${clinicId}/config-overview`,
      ),
    enabled: Number.isFinite(clinicId),
  });

  const companies = data?.companies ?? [];

  // Select the first enabled insurer by default.
  useEffect(() => {
    if (selectedCompanyId !== null || companies.length === 0) return;
    const first = companies.find((c) => c.enabled) ?? companies[0];
    if (!first) return;
    setSelectedCompanyId(first.company_id);
  }, [companies, selectedCompanyId]);

  const filteredCompanies = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return companies;
    return companies.filter((c) => c.company_name.toLowerCase().includes(kw));
  }, [companies, search]);

  const selectedCompany = companies.find((c) => c.company_id === selectedCompanyId) ?? null;

  function pushToast(message: string, type: Toast["type"]) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2600);
  }

  function errMessage(err: unknown, fallback: string) {
    return err instanceof ApiRequestError ? err.message : fallback;
  }

  // Update one insurer in the local query cache.
  function patchCompany(
    companyId: number,
    updater: (c: CompanyConfigItem) => CompanyConfigItem,
  ) {
    qc.setQueryData<ClinicConfigOverview>(queryKey, (prev) => {
      if (!prev) return prev;
      return {
        companies: prev.companies.map((c) =>
          c.company_id === companyId ? updater(c) : c,
        ),
      };
    });
  }

  const companyMut = useMutation({
    mutationFn: ({ companyId, enabled }: { companyId: number; enabled: boolean }) =>
      apiFetch(`/api/admin/clinics/${clinicId}/insurance-companies/${companyId}`, {
        method: "PATCH",
        body: { enabled },
      }),
    onSuccess: (_res, { enabled }) =>
      pushToast(
        t(enabled ? "admin.config.companyEnabled" : "admin.config.companyDisabled"),
        "success",
      ),
    onError: (err, { companyId, enabled }) => {
      patchCompany(companyId, (c) => ({ ...c, enabled: !enabled }));
      pushToast(errMessage(err, t("admin.common.operationFailed")), "error");
    },
  });

  const templateMut = useMutation({
    mutationFn: ({
      templateId,
      enabled,
    }: {
      companyId: number;
      templateId: number;
      enabled: boolean;
    }) =>
      apiFetch(`/api/admin/clinics/${clinicId}/templates/${templateId}`, {
        method: "PATCH",
        body: { enabled },
      }),
    onSuccess: (_res, { enabled }) =>
      pushToast(
        t(enabled ? "admin.config.templateEnabled" : "admin.config.templateDisabled"),
        "success",
      ),
    onError: (err, { companyId, templateId, enabled }) => {
      patchCompany(companyId, (c) => {
        const templates = c.templates.map((t) =>
          t.template_id === templateId ? { ...t, enabled: !enabled } : t,
        );
        return {
          ...c,
          templates,
          enabled_template_count: templates.filter((t) => t.enabled).length,
        };
      });
      pushToast(errMessage(err, t("admin.common.operationFailed")), "error");
    },
  });

  const bulkMut = useMutation({
    mutationFn: ({
      companyId,
      templateIds,
    }: {
      companyId: number;
      templateIds: number[];
    }) =>
      apiFetch<{ enabled_template_ids: number[] }>(
        `/api/admin/clinics/${clinicId}/companies/${companyId}/templates`,
        { method: "PUT", body: { template_ids: templateIds } },
      ),
    onSuccess: (res, { companyId }) => {
      const enabledSet = new Set(res.enabled_template_ids);
      patchCompany(companyId, (c) => {
        const templates = c.templates.map((t) => ({
          ...t,
          enabled: enabledSet.has(t.template_id),
        }));
        return {
          ...c,
          templates,
          enabled_template_count: templates.filter((t) => t.enabled).length,
        };
      });
      pushToast(t("admin.config.bulkSuccess"), "success");
    },
    onError: (err) => {
      qc.invalidateQueries({ queryKey });
      pushToast(errMessage(err, t("admin.config.bulkFailed")), "error");
    },
  });

  function toggleCompany(company: CompanyConfigItem) {
    const next = !company.enabled;
    patchCompany(company.company_id, (c) => ({ ...c, enabled: next }));
    companyMut.mutate({ companyId: company.company_id, enabled: next });
  }

  function toggleTemplate(
    company: CompanyConfigItem,
    templateId: number,
    current: boolean,
  ) {
    const next = !current;
    patchCompany(company.company_id, (c) => {
      const templates = c.templates.map((t) =>
        t.template_id === templateId ? { ...t, enabled: next } : t,
      );
      return {
        ...c,
        templates,
        enabled_template_count: templates.filter((t) => t.enabled).length,
      };
    });
    templateMut.mutate({
      companyId: company.company_id,
      templateId,
      enabled: next,
    });
  }

  function selectAll(company: CompanyConfigItem, all: boolean) {
    const ids = all
      ? company.templates.filter((t) => t.is_active).map((t) => t.template_id)
      : [];
    const idSet = new Set(ids);
    patchCompany(company.company_id, (c) => {
      const templates = c.templates.map((t) => ({
        ...t,
        enabled: idSet.has(t.template_id),
      }));
      return {
        ...c,
        templates,
        enabled_template_count: templates.filter((t) => t.enabled).length,
      };
    });
    bulkMut.mutate({ companyId: company.company_id, templateIds: ids });
  }

  const clinicTitle = clinic?.clinic_name ?? t("admin.config.defaultClinic");

  return (
    <div>
      <PageHeader
        title={t("admin.config.title", { clinic: clinicTitle })}
        description={t("admin.config.description")}
        action={
          <Link href="/admin/clinics">
            <Button variant="outline">{t("admin.config.back")}</Button>
          </Link>
        }
      />

      {isLoading ? (
        <p className="text-sm text-[var(--color-muted-foreground)]">{t("admin.common.loading")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
          {/* Insurance company list */}
          <Card>
            <CardContent className="pt-6">
              <Input
                placeholder={t("admin.config.searchCompany")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="mb-4"
              />
              <div className="flex flex-col gap-2">
                {filteredCompanies.map((c) => {
                  const active = c.company_id === selectedCompanyId;
                  return (
                    <button
                      key={c.company_id}
                      type="button"
                      onClick={() => setSelectedCompanyId(c.company_id)}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        active
                          ? "border-[var(--color-primary)] bg-[var(--color-muted)]"
                          : "border-transparent hover:bg-[var(--color-muted)]"
                      } ${c.enabled ? "" : "opacity-55"}`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--color-muted)] text-[var(--color-muted-foreground)]">
                          🏛
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {c.company_name}
                          </div>
                          <div className="text-xs text-[var(--color-muted-foreground)]">
                            {c.enabled
                              ? t("admin.config.selectedTemplates", {
                                  enabled: c.enabled_template_count,
                                  total: c.template_count,
                                })
                              : t("admin.config.notEnabled")}
                          </div>
                        </div>
                      </div>
                      <span
                        role="switch"
                        aria-checked={c.enabled}
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCompany(c);
                        }}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors ${
                          c.enabled
                            ? "bg-[var(--color-primary)]"
                            : "bg-[var(--color-muted)]"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                            c.enabled ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </span>
                    </button>
                  );
                })}
                {filteredCompanies.length === 0 && (
                  <p className="py-6 text-center text-sm text-[var(--color-muted-foreground)]">
                    {t("admin.config.noCompanies")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Template list */}
          <Card>
            <CardContent className="pt-6">
              {!selectedCompany ? (
                <p className="py-10 text-center text-sm text-[var(--color-muted-foreground)]">
                  {t("admin.config.selectCompany")}
                </p>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      {t("admin.config.availableTemplates", {
                        company: selectedCompany.company_name,
                      })}
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="mr-1 text-xs text-[var(--color-muted-foreground)]">
                        {t("admin.config.autoSave")}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={
                          !selectedCompany.enabled ||
                          bulkMut.isPending ||
                          selectedCompany.templates.every((t) => !t.is_active)
                        }
                        onClick={() => selectAll(selectedCompany, true)}
                      >
                        {t("admin.config.selectAll")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!selectedCompany.enabled || bulkMut.isPending}
                        onClick={() => selectAll(selectedCompany, false)}
                      >
                        {t("admin.config.selectNone")}
                      </Button>
                    </div>
                  </div>

                  {!selectedCompany.enabled && (
                    <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      {t("admin.config.companyDisabledHint")}
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    {selectedCompany.templates.map((t) => {
                      const disabled = !t.is_active || !selectedCompany.enabled;
                      return (
                        <label
                          key={t.template_id}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2.5 ${
                            disabled
                              ? "cursor-not-allowed opacity-55"
                              : "cursor-pointer hover:bg-[var(--color-muted)]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-[var(--color-primary)]"
                              checked={t.enabled}
                              disabled={disabled}
                              onChange={() =>
                                toggleTemplate(
                                  selectedCompany,
                                  t.template_id,
                                  t.enabled,
                                )
                              }
                            />
                            <div>
                              <div className="text-sm font-medium">
                                {t.template_name}
                              </div>
                              <div className="text-xs text-[var(--color-muted-foreground)]">
                                {translate("admin.config.updatedAt", {
                                  version: t.version,
                                  date: formatDate(t.updated_at),
                                })}
                              </div>
                            </div>
                          </div>
                          {t.is_active ? (
                            <Badge variant="success">
                              {translate("admin.config.isPublished")}
                            </Badge>
                          ) : (
                            <Badge variant="warning">
                              {translate("admin.config.notPublished")}
                            </Badge>
                          )}
                        </label>
                      );
                    })}
                    {selectedCompany.templates.length === 0 && (
                      <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                        {t("admin.config.noTemplates")}
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Auto-save toasts */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded-md px-4 py-2 text-sm text-white shadow-lg ${
              t.type === "success" ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
