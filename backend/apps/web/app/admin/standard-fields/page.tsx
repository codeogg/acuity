"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { FieldDomain, StandardField } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

const DATA_TYPES = ["text", "number", "date", "boolean", "enum", "signature", "image"];
const PAGE_SIZE = 10;

const EMPTY_FORM = {
  field_code: "",
  field_name: "",
  domain_id: 0,
  data_type: "text",
  is_required: false,
  ai_extraction_hint: "",
};

type FieldForm = typeof EMPTY_FORM;

export default function StandardFieldsPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FieldForm>(EMPTY_FORM);

  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);

  const domains = useQuery({
    queryKey: ["field-domains"],
    queryFn: () => apiFetch<FieldDomain[]>("/api/admin/field-domains"),
  });
  const fields = useQuery({
    queryKey: ["standard-fields"],
    queryFn: () => apiFetch<StandardField[]>("/api/admin/standard-fields"),
  });

  const domainName = (id: number) =>
    domains.data?.find((d) => d.id === id)?.domain_name ?? "-";

  const saveMut = useMutation({
    mutationFn: () => {
      if (editingId) {
        return apiFetch(`/api/admin/standard-fields/${editingId}`, {
          method: "PUT",
          body: {
            field_name: form.field_name,
            domain_id: form.domain_id,
            data_type: form.data_type,
            is_required: form.is_required,
            ai_extraction_hint: form.ai_extraction_hint || null,
          },
        });
      }
      return apiFetch("/api/admin/standard-fields", { method: "POST", body: form });
    },
    onSuccess: () => {
      closeForm();
      qc.invalidateQueries({ queryKey: ["standard-fields"] });
    },
    onError: (err) => {
      window.alert(err instanceof ApiRequestError ? err.message : t("admin.common.saveFailed"));
    },
  });

  const toggleMut = useMutation({
    mutationFn: (f: StandardField) =>
      apiFetch(`/api/admin/standard-fields/${f.id}`, {
        method: "PUT",
        body: { is_active: !f.is_active },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["standard-fields"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/standard-fields/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["standard-fields"] }),
    onError: (err) => {
      window.alert(err instanceof ApiRequestError ? err.message : t("admin.common.deleteFailed"));
    },
  });

  function openCreate() {
    saveMut.reset();
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  function openEdit(f: StandardField) {
    saveMut.reset();
    setEditingId(f.id);
    setForm({
      field_code: f.field_code,
      field_name: f.field_name,
      domain_id: f.domain_id,
      data_type: f.data_type,
      is_required: f.is_required,
      ai_extraction_hint: f.ai_extraction_hint ?? "",
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

  function handleDelete(f: StandardField) {
    if (window.confirm(t("admin.fields.deleteDescription", { name: f.field_name, code: f.field_code }))) {
      deleteMut.mutate(f.id);
    }
  }

  const filtered = useMemo(() => {
    const list = fields.data ?? [];
    if (!keyword) return list;
    const kw = keyword.toLowerCase();
    return list.filter(
      (f) =>
        f.field_code.toLowerCase().includes(kw) ||
        f.field_name.toLowerCase().includes(kw) ||
        (f.field_name_en?.toLowerCase().includes(kw) ?? false),
    );
  }, [fields.data, keyword]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader
        title={t("admin.fields.title")}
        description={t("admin.fields.description")}
        action={
          <Button
            onClick={() => (showForm ? closeForm() : openCreate())}
            disabled={!domains.data?.length}
          >
            {t("admin.fields.add")}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardContent className="grid grid-cols-3 gap-4 pt-6">
            {saveMut.isError && (
              <div className="col-span-3 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {saveMut.error instanceof ApiRequestError
                  ? saveMut.error.message
                  : t("admin.common.saveFailed")}
              </div>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>
                {t("admin.fields.code")}
                {editingId ? t("admin.fields.immutable") : ""}
              </Label>
              <Input
                value={form.field_code}
                placeholder="patient_name_cn"
                disabled={!!editingId}
                onChange={(e) => setForm({ ...form, field_code: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.fields.name")}</Label>
              <Input
                value={form.field_name}
                onChange={(e) => setForm({ ...form, field_name: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.fields.domain")}</Label>
              <select
                className="h-9 rounded-lg border border-[var(--color-input)] bg-transparent px-3 text-sm"
                value={form.domain_id}
                onChange={(e) => setForm({ ...form, domain_id: Number(e.target.value) })}
              >
                <option value={0}>{t("admin.fields.select")}</option>
                {domains.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.domain_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.fields.dataType")}</Label>
              <select
                className="h-9 rounded-lg border border-[var(--color-input)] bg-transparent px-3 text-sm"
                value={form.data_type}
                onChange={(e) => setForm({ ...form, data_type: e.target.value })}
              >
                {DATA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>{t("admin.fields.aiHint")}</Label>
              <Input
                value={form.ai_extraction_hint}
                onChange={(e) => setForm({ ...form, ai_extraction_hint: e.target.value })}
              />
            </div>
            <label className="col-span-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={(e) => setForm({ ...form, is_required: e.target.checked })}
              />
              {t("admin.fields.required")}
            </label>
            <div className="col-span-3 flex gap-2">
              <Button
                onClick={() => saveMut.mutate()}
                disabled={
                  !form.field_code ||
                  !form.field_name ||
                  !form.domain_id ||
                  saveMut.isPending
                }
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
              placeholder={t("admin.fields.searchPlaceholder")}
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

          {fields.isLoading ? (
            <p className="text-sm text-[var(--color-muted-foreground)]">{t("admin.common.loading")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="py-2">{t("admin.fields.code")}</th>
                  <th className="py-2">{t("admin.fields.name")}</th>
                  <th className="py-2">{t("admin.fields.domain")}</th>
                  <th className="py-2">{t("admin.fields.type")}</th>
                  <th className="py-2">{t("admin.fields.source")}</th>
                  <th className="py-2">{t("admin.fields.requiredShort")}</th>
                  <th className="py-2">{t("admin.common.status")}</th>
                  <th className="py-2 text-right">{t("admin.common.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((f) => (
                  <tr key={f.id} className="border-b">
                    <td className="py-2.5 font-mono text-xs">{f.field_code}</td>
                    <td className="py-2.5">{f.field_name}</td>
                    <td className="py-2.5">{domainName(f.domain_id)}</td>
                    <td className="py-2.5">
                      <Badge variant="secondary">{f.data_type}</Badge>
                    </td>
                    <td className="py-2.5 text-xs">{f.source_type}</td>
                    <td className="py-2.5">{t(f.is_required ? "admin.common.yes" : "admin.common.no")}</td>
                    <td className="py-2.5">
                      <Badge variant={f.is_active ? "success" : "secondary"}>
                        {t(f.is_active ? "admin.common.enabled" : "admin.common.disabled")}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEdit(f)}>
                          {t("admin.common.edit")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleMut.mutate(f)}
                        >
                          {t(f.is_active ? "admin.common.disabled" : "admin.common.enabled")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => handleDelete(f)}
                          disabled={deleteMut.isPending}
                        >
                          {t("admin.common.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {total === 0 && (
                  <tr>
                    <td
                      colSpan={8}
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
    </div>
  );
}
