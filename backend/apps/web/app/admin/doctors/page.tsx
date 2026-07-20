"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Toast } from "@/components/ui/toast";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { Clinic, Doctor, Page } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  clinic_id: 0,
  doctor_name: "",
  doctor_name_en: "",
  login_account: "",
  password: "",
  reg_no: "",
};

type DoctorForm = typeof EMPTY_FORM;

export default function DoctorsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<DoctorForm>(EMPTY_FORM);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState<{ message: string; variant: "error" } | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] = useState<Doctor | null>(null);

  function showError(err: unknown, fallback: string) {
    const message = err instanceof ApiRequestError ? err.message : fallback;
    setToast({ message, variant: "error" });
  }

  const clinics = useQuery({
    queryKey: ["clinics"],
    queryFn: () =>
      apiFetch<Page<Clinic>>("/api/admin/clinics", { query: { page_size: 100 } }),
  });

  const doctors = useQuery({
    queryKey: ["doctors", page, keyword],
    queryFn: () =>
      apiFetch<Page<Doctor>>("/api/admin/doctors", {
        query: { page, page_size: PAGE_SIZE, keyword: keyword || undefined },
      }),
  });

  const clinicNameMap = useMemo(() => {
    const map = new Map<number, string>();
    clinics.data?.items.forEach((c) => map.set(c.id, c.clinic_name));
    return map;
  }, [clinics.data]);

  const saveMut = useMutation({
    mutationFn: () => {
      if (editingId) {
        return apiFetch(`/api/admin/doctors/${editingId}`, {
          method: "PUT",
          body: {
            doctor_name: form.doctor_name,
            doctor_name_en: form.doctor_name_en || null,
            login_account: form.login_account,
            reg_no: form.reg_no || null,
          },
        });
      }
      return apiFetch("/api/admin/doctors", { method: "POST", body: form });
    },
    onSuccess: () => {
      closeForm();
      qc.invalidateQueries({ queryKey: ["doctors"] });
    },
    onError: (err) =>
      showError(err, t(editingId ? "admin.common.editFailed" : "admin.common.createFailed")),
  });

  const toggleMut = useMutation({
    mutationFn: (d: Doctor) =>
      apiFetch(`/api/admin/doctors/${d.id}/status`, {
        method: "PATCH",
        body: { status: d.status === 1 ? 0 : 1 },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["doctors"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/doctors/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["doctors"] });
    },
    onError: (err) => showError(err, t("admin.common.deleteFailed")),
  });

  const resetMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch<{ temp_password: string }>(`/api/admin/doctors/${id}/reset-password`, {
        method: "POST",
      }),
    onSuccess: (res) => setTempPassword(res.temp_password),
  });

  function openCreate() {
    saveMut.reset();
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(d: Doctor) {
    saveMut.reset();
    setEditingId(d.id);
    setForm({
      clinic_id: d.clinic_id,
      doctor_name: d.doctor_name,
      doctor_name_en: d.doctor_name_en ?? "",
      login_account: d.login_account,
      password: "",
      reg_no: d.reg_no ?? "",
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

  const canSave = editingId
    ? !!form.doctor_name && !!form.login_account
    : !!form.clinic_id && !!form.doctor_name && !!form.login_account && !!form.password;

  const total = doctors.data?.total ?? 0;
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
        title={t("admin.doctors.title")}
        description={t("admin.doctors.description")}
        action={<Button onClick={() => (showForm ? closeForm() : openCreate())}>{t("admin.doctors.add")}</Button>}
      />

      {tempPassword && (
        <Card className="mb-4 border-amber-300 bg-amber-50">
          <CardContent className="pt-6 text-sm">
            {t("admin.doctors.tempPassword")}
            <span className="ml-2 font-mono font-semibold">{tempPassword}</span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-4"
              onClick={() => setTempPassword(null)}
            >
              {t("admin.doctors.gotIt")}
            </Button>
          </CardContent>
        </Card>
      )}

      {showForm && (
        <Card className="mb-6">
          <CardContent className="grid grid-cols-3 gap-4 pt-6">
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.doctors.clinic")}</Label>
              <SearchableSelect
                value={form.clinic_id}
                disabled={!!editingId}
                placeholder={t("admin.doctors.selectClinic")}
                options={
                  clinics.data?.items.map((c) => ({
                    value: c.id,
                    label: c.clinic_name,
                  })) ?? []
                }
                onChange={(v) => setForm({ ...form, clinic_id: v })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.doctors.name")}</Label>
              <Input
                value={form.doctor_name}
                onChange={(e) => setForm({ ...form, doctor_name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.doctors.nameEn")}</Label>
              <Input
                value={form.doctor_name_en}
                onChange={(e) => setForm({ ...form, doctor_name_en: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.doctors.regNo")}</Label>
              <Input
                value={form.reg_no}
                onChange={(e) => setForm({ ...form, reg_no: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.doctors.login")}</Label>
              <Input
                value={form.login_account}
                onChange={(e) => setForm({ ...form, login_account: e.target.value })}
              />
            </div>
            {!editingId && (
              <div className="flex flex-col gap-1.5">
                <Label>{t("admin.doctors.initialPassword")}</Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            )}
            <div className="col-span-3 flex gap-2">
              <Button onClick={() => saveMut.mutate()} disabled={!canSave || saveMut.isPending}>
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
              placeholder={t("admin.doctors.searchPlaceholder")}
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

          {doctors.isLoading ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">{t("admin.common.loading")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="py-2">{t("admin.doctors.name")}</th>
                  <th className="py-2">{t("admin.doctors.clinic")}</th>
                  <th className="py-2">{t("admin.doctors.login")}</th>
                  <th className="py-2">{t("admin.doctors.regNo")}</th>
                  <th className="py-2">{t("admin.common.status")}</th>
                  <th className="py-2 text-right">{t("admin.common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {doctors.data?.items.map((d) => (
                  <tr key={d.id} className="border-b">
                    <td className="py-2.5">{d.doctor_name}</td>
                    <td className="py-2.5 text-[var(--color-muted-foreground)]">
                      {clinicNameMap.get(d.clinic_id) ?? `#${d.clinic_id}`}
                    </td>
                    <td className="py-2.5 font-mono text-xs">{d.login_account}</td>
                    <td className="py-2.5">{d.reg_no ?? "-"}</td>
                    <td className="py-2.5">
                      <Badge variant={d.status === 1 ? "success" : "secondary"}>
                        {t(d.status === 1 ? "admin.common.enabled" : "admin.common.disabled")}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(d)}>
                          {t("admin.common.edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleMut.mutate(d)}
                        >
                          {t(d.status === 1 ? "admin.common.disabled" : "admin.common.enabled")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resetMut.mutate(d.id)}
                        >
                          {t("admin.doctors.resetPassword")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => setPendingDelete(d)}
                          disabled={deleteMut.isPending}
                        >
                          {t("admin.common.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {doctors.data?.items.length === 0 && (
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
        title={t("admin.doctors.deleteTitle")}
        description={
          pendingDelete
            ? t("admin.doctors.deleteDescription", { name: pendingDelete.doctor_name })
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
