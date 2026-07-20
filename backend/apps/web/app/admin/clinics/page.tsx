"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toast } from "@/components/ui/toast";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { Clinic, Doctor, Page } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

const PAGE_SIZE = 10;

const EMPTY_FORM = {
  clinic_name: "",
  clinic_name_en: "",
  address: "",
  phone: "",
};

type ClinicForm = typeof EMPTY_FORM;

export default function ClinicsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ClinicForm>(EMPTY_FORM);

  // Keep the live search input separate from the submitted query.
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [doctorModalClinic, setDoctorModalClinic] = useState<Clinic | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Clinic | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "error" } | null>(
    null,
  );

  function showError(err: unknown, fallback: string) {
    const message = err instanceof ApiRequestError ? err.message : fallback;
    setToast({ message, variant: "error" });
  }

  const { data, isLoading } = useQuery({
    queryKey: ["clinics", page, keyword],
    queryFn: () =>
      apiFetch<Page<Clinic>>("/api/admin/clinics", {
        query: { page, page_size: PAGE_SIZE, keyword: keyword || undefined },
      }),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      editingId
        ? apiFetch<Clinic>(`/api/admin/clinics/${editingId}`, {
            method: "PUT",
            body: form,
          })
        : apiFetch<Clinic>("/api/admin/clinics", { method: "POST", body: form }),
    onSuccess: () => {
      closeForm();
      qc.invalidateQueries({ queryKey: ["clinics"] });
    },
    onError: (err) =>
      showError(err, t(editingId ? "admin.common.editFailed" : "admin.common.createFailed")),
  });

  const toggleMut = useMutation({
    mutationFn: (c: Clinic) =>
      apiFetch(`/api/admin/clinics/${c.id}/status`, {
        method: "PATCH",
        body: { status: c.status === 1 ? 0 : 1 },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clinics"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/clinics/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["clinics"] });
    },
    onError: (err) => showError(err, t("admin.common.deleteFailed")),
  });

  const clinicDoctors = useQuery({
    queryKey: ["clinic-doctors", doctorModalClinic?.id],
    queryFn: () =>
      apiFetch<Page<Doctor>>("/api/admin/doctors", {
        query: { clinic_id: doctorModalClinic!.id, page: 1, page_size: 100 },
      }),
    enabled: !!doctorModalClinic,
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(c: Clinic) {
    setEditingId(c.id);
    setForm({
      clinic_name: c.clinic_name,
      clinic_name_en: c.clinic_name_en ?? "",
      address: c.address ?? "",
      phone: c.phone ?? "",
    });
    setShowForm(true);
  }

  function closeForm() {
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
        title={t("admin.clinics.title")}
        description={t("admin.clinics.description")}
        action={<Button onClick={() => (showForm ? closeForm() : openCreate())}>{t("admin.clinics.add")}</Button>}
      />

      {showForm && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>{t("admin.clinics.name")}</Label>
                <Input
                  value={form.clinic_name}
                  onChange={(e) => setForm({ ...form, clinic_name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("admin.clinics.nameEn")}</Label>
                <Input
                  value={form.clinic_name_en}
                  onChange={(e) => setForm({ ...form, clinic_name_en: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("admin.clinics.address")}</Label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t("admin.clinics.phone")}</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => saveMut.mutate()}
                disabled={!form.clinic_name || saveMut.isPending}
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
              placeholder={t("admin.clinics.searchPlaceholder")}
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
                  <th className="py-2">{t("admin.clinics.code")}</th>
                  <th className="py-2">{t("admin.clinics.name")}</th>
                  <th className="py-2">{t("admin.clinics.nameEn")}</th>
                  <th className="py-2">{t("admin.clinics.address")}</th>
                  <th className="py-2">{t("admin.clinics.phone")}</th>
                  <th className="py-2">{t("admin.common.status")}</th>
                  <th className="py-2 text-right">{t("admin.common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="py-2.5 font-mono text-xs">{c.clinic_code}</td>
                    <td className="py-2.5">{c.clinic_name}</td>
                    <td className="py-2.5 text-[var(--color-muted-foreground)]">
                      {c.clinic_name_en ?? "-"}
                    </td>
                    <td className="py-2.5 text-[var(--color-muted-foreground)]">
                      {c.address ?? "-"}
                    </td>
                    <td className="py-2.5">{c.phone ?? "-"}</td>
                    <td className="py-2.5">
                      {c.status === 1 ? (
                        <Badge variant="success">{t("admin.common.enabled")}</Badge>
                      ) : (
                        <Badge variant="secondary">{t("admin.common.disabled")}</Badge>
                      )}
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDoctorModalClinic(c)}
                        >
                          {t("admin.clinics.doctors")}
                        </Button>
                        <Link href={`/admin/clinics/${c.id}/config`}>
                          <Button variant="outline" size="sm">
                            {t("admin.clinics.config")}
                          </Button>
                        </Link>
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
                      colSpan={7}
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

      {doctorModalClinic && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDoctorModalClinic(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg border bg-[var(--color-background)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="text-base font-semibold">
                  {t("admin.clinics.boundDoctors", { clinic: doctorModalClinic.clinic_name })}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--color-muted-foreground)]">
                  {t("admin.clinics.doctorCount", { count: clinicDoctors.data?.total ?? 0 })}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDoctorModalClinic(null)}>
                {t("admin.common.close")}
              </Button>
            </div>
            <div className="max-h-[calc(80vh-4.5rem)] overflow-y-auto px-5 py-4">
              {clinicDoctors.isLoading ? (
                <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                  {t("admin.common.loading")}
                </p>
              ) : clinicDoctors.data?.items.length ? (
                <table className="w-full text-sm">
                  <thead className="border-b text-left text-xs text-[var(--color-muted-foreground)]">
                    <tr>
                      <th className="py-2">{t("admin.doctors.name")}</th>
                      <th className="py-2">{t("admin.doctors.login")}</th>
                      <th className="py-2">{t("admin.doctors.regNo")}</th>
                      <th className="py-2">{t("admin.common.status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clinicDoctors.data.items.map((d) => (
                      <tr key={d.id} className="border-b">
                        <td className="py-2.5">{d.doctor_name}</td>
                        <td className="py-2.5 font-mono text-xs">{d.login_account}</td>
                        <td className="py-2.5">{d.reg_no ?? "-"}</td>
                        <td className="py-2.5">
                          <Badge variant={d.status === 1 ? "success" : "secondary"}>
                            {t(d.status === 1 ? "admin.common.enabled" : "admin.common.disabled")}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="py-8 text-center text-sm text-[var(--color-muted-foreground)]">
                  {t("admin.clinics.noDoctors")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("admin.clinics.deleteTitle")}
        description={
          pendingDelete
            ? t("admin.clinics.deleteDescription", { name: pendingDelete.clinic_name })
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
