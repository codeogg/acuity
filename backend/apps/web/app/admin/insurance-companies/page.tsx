"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toast } from "@/components/ui/toast";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import { resolveStorageUrl } from "@/lib/api/storage";
import type { InsuranceCompany, Page } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  company_name: "",
  company_name_en: "",
  contact_info: "",
  logo_url: "",
};

type CompanyForm = typeof EMPTY_FORM;

export default function InsuranceCompaniesPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<CompanyForm>(EMPTY_FORM);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; variant: "error" } | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<InsuranceCompany | null>(null);

  function showError(err: unknown, fallback: string) {
    const message = err instanceof ApiRequestError ? err.message : fallback;
    setToast({ message, variant: "error" });
  }

  const { data, isLoading } = useQuery({
    queryKey: ["insurance-companies", page, keyword],
    queryFn: () =>
      apiFetch<Page<InsuranceCompany>>("/api/admin/insurance-companies", {
        query: { page, page_size: PAGE_SIZE, keyword: keyword || undefined },
      }),
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const body = {
        company_name: form.company_name,
        company_name_en: form.company_name_en || null,
        contact_info: form.contact_info || null,
        logo_url: form.logo_url || null,
      };
      return editingId
        ? apiFetch(`/api/admin/insurance-companies/${editingId}`, {
            method: "PUT",
            body,
          })
        : apiFetch("/api/admin/insurance-companies", { method: "POST", body });
    },
    onSuccess: () => {
      closeForm();
      qc.invalidateQueries({ queryKey: ["insurance-companies"] });
    },
    onError: (err) =>
      showError(err, t(editingId ? "admin.common.editFailed" : "admin.common.createFailed")),
  });

  const toggleMut = useMutation({
    mutationFn: (c: InsuranceCompany) =>
      apiFetch(`/api/admin/insurance-companies/${c.id}/status`, {
        method: "PATCH",
        body: { status: c.status === 1 ? 0 : 1 },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["insurance-companies"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/insurance-companies/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["insurance-companies"] });
    },
    onError: (err) => showError(err, t("admin.common.deleteFailed")),
  });

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch<{ url: string }>(
        "/api/admin/insurance-companies/logo",
        { method: "POST", formData: fd },
      );
      setForm((f) => ({ ...f, logo_url: res.url }));
    } catch (err) {
      showError(err, t("admin.insurers.logoUploadFailed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function openCreate() {
    saveMut.reset();
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(c: InsuranceCompany) {
    saveMut.reset();
    setEditingId(c.id);
    setForm({
      company_name: c.company_name,
      company_name_en: c.company_name_en ?? "",
      contact_info: c.contact_info ?? "",
      logo_url: c.logo_url ?? "",
    });
    setShowForm(true);
  }

  function closeForm() {
    saveMut.reset();
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function runSearch() {
    setKeyword(searchInput.trim());
    setPage(1);
  }

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          duration={3000}
          onDismiss={() => setToast(null)}
        />
      )}

      <PageHeader
        title={t("admin.insurers.title")}
        description={t("admin.insurers.description")}
        action={
          <Button onClick={() => (showForm ? closeForm() : openCreate())}>
            {t("admin.insurers.add")}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardContent className="grid grid-cols-2 gap-4 pt-6">
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.insurers.nameZh")}</Label>
              <Input
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.insurers.nameEn")}</Label>
              <Input
                value={form.company_name_en}
                onChange={(e) => setForm({ ...form, company_name_en: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.insurers.contact")}</Label>
              <Input
                value={form.contact_info}
                onChange={(e) => setForm({ ...form, contact_info: e.target.value })}
                placeholder={t("admin.insurers.contactPlaceholder")}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Logo</Label>
              <div className="flex items-center gap-3">
                {form.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={resolveStorageUrl(form.logo_url)}
                    alt="logo"
                    className="h-12 w-12 rounded border object-contain"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded border text-xs text-[var(--color-muted-foreground)]">
                    {t("admin.insurers.none")}
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoChange}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading
                    ? t("admin.insurers.uploading")
                    : form.logo_url
                      ? t("admin.insurers.replace")
                      : t("admin.insurers.uploadLogo")}
                </Button>
                {form.logo_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm({ ...form, logo_url: "" })}
                  >
                    {t("admin.insurers.remove")}
                  </Button>
                )}
              </div>
            </div>
            <div className="col-span-2 flex gap-2">
              <Button
                onClick={() => saveMut.mutate()}
                disabled={!form.company_name || saveMut.isPending || uploading}
              >
                {t(editingId ? "admin.common.saveChanges" : "admin.common.save")}
              </Button>
              <Button variant="ghost" onClick={closeForm}>
                {t("admin.common.cancel")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center gap-2">
            <Input
              className="max-w-xs"
              placeholder={t("admin.insurers.searchPlaceholder")}
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runSearch();
              }}
            />
            <Button variant="outline" size="sm" onClick={runSearch}>
              {t("admin.common.search")}
            </Button>
            {keyword && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchInput("");
                  setKeyword("");
                  setPage(1);
                }}
              >
                {t("admin.common.reset")}
              </Button>
            )}
          </div>

          {isLoading ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">{t("admin.common.loading")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="py-2">Logo</th>
                  <th className="py-2">{t("admin.insurers.name")}</th>
                  <th className="py-2">{t("admin.insurers.nameEn")}</th>
                  <th className="py-2">{t("admin.insurers.contact")}</th>
                  <th className="py-2">{t("admin.common.status")}</th>
                  <th className="py-2 text-right">{t("admin.common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2.5">
                      {c.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={resolveStorageUrl(c.logo_url)}
                          alt={c.company_name}
                          className="h-8 w-8 rounded border object-contain"
                        />
                      ) : (
                        <span className="text-[var(--color-muted-foreground)]">-</span>
                      )}
                    </td>
                    <td className="py-2.5">{c.company_name}</td>
                    <td className="py-2.5 text-[var(--color-muted-foreground)]">
                      {c.company_name_en ?? "-"}
                    </td>
                    <td className="py-2.5 text-[var(--color-muted-foreground)]">
                      {c.contact_info ?? "-"}
                    </td>
                    <td className="py-2.5">
                      <Badge variant={c.status === 1 ? "success" : "secondary"}>
                        {t(c.status === 1 ? "admin.common.enabled" : "admin.common.disabled")}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                          {t("admin.common.edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleMut.mutate(c)}
                        >
                          {t(c.status === 1 ? "admin.common.disabled" : "admin.common.enabled")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setPendingDelete(c)}
                          disabled={deleteMut.isPending}
                        >
                          {t("admin.common.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {data?.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-6 text-center text-[var(--color-muted-foreground)]"
                    >
                      {t("admin.common.noData")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}

          {total > 0 && (
            <div className="mt-4 flex items-center justify-between text-sm text-[var(--color-muted-foreground)]">
              <span>
                {t("admin.common.pagination", { total, page, totalPages })}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("admin.common.previous")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t("admin.common.next")}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("admin.insurers.deleteTitle")}
        description={
          pendingDelete
            ? t("admin.insurers.deleteDescription", { name: pendingDelete.company_name })
            : ""
        }
        confirmLabel={t("admin.common.confirmDelete")}
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => {
          if (pendingDelete) deleteMut.mutate(pendingDelete.id);
        }}
      />
    </div>
  );
}
