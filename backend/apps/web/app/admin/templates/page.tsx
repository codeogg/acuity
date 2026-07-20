"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { TemplateParseStatus } from "@/components/annotator/TemplateParseStatus";
import { isParseActive } from "@/lib/hooks/useParseProgress";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { InsuranceCompany, Page, ParseStatus, PolicyTemplate } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

const STATUS_VARIANT: Record<
  ParseStatus,
  "default" | "secondary" | "success" | "warning" | "destructive"
> = {
  PENDING: "secondary",
  PARSING: "default",
  AUTO_PARSED: "warning",
  AI_ASSISTED: "warning",
  ANNOTATED: "warning",
  PUBLISHED: "success",
  PARSE_FAILED: "destructive",
};

const PAGE_SIZE = 10;

const EMPTY_FORM = { company_id: 0, template_name: "" };

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border bg-[var(--color-background)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("admin.common.close")}
          </Button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export default function TemplatesPage() {
  const { t } = useI18n();
  const translate = t;
  const qc = useQueryClient();
  const createFileRef = useRef<HTMLInputElement>(null);
  const editFileRef = useRef<HTMLInputElement>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_FORM);
  const [createFileName, setCreateFileName] = useState("");

  const [editingTemplate, setEditingTemplate] = useState<PolicyTemplate | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editFileName, setEditFileName] = useState("");

  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<PolicyTemplate | null>(null);

  const companies = useQuery({
    queryKey: ["insurance-companies"],
    queryFn: () =>
      apiFetch<Page<InsuranceCompany>>("/api/admin/insurance-companies", {
        query: { page_size: 100 },
      }),
  });

  const templates = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiFetch<PolicyTemplate[]>("/api/admin/templates"),
    refetchInterval: (q) =>
      q.state.data?.some((t) => isParseActive(t.parse_status) || t.parse_status === "AUTO_PARSED")
        ? 5000
        : false,
  });

  const companyName = (id: number) =>
    companies.data?.items.find((c) => c.id === id)?.company_name ?? `#${id}`;

  const companyOptions = useMemo(
    () =>
      companies.data?.items.map((c) => ({ value: c.id, label: c.company_name })) ?? [],
    [companies.data],
  );

  const uploadMut = useMutation({
    mutationFn: () => {
      const file = createFileRef.current?.files?.[0];
      if (!file) throw new Error(t("admin.templates.selectPdfError"));
      const fd = new FormData();
      fd.append("company_id", String(createForm.company_id));
      fd.append("template_name", createForm.template_name);
      fd.append("file", file);
      return apiFetch("/api/admin/templates", { method: "POST", formData: fd });
    },
    onSuccess: () => {
      closeCreateModal();
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
  });

  const editMut = useMutation({
    mutationFn: async () => {
      if (!editingTemplate) return;
      await apiFetch(`/api/admin/templates/${editingTemplate.id}`, {
        method: "PUT",
        body: {
          template_name: editForm.template_name,
          company_id: editForm.company_id,
        },
      });
      const file = editFileRef.current?.files?.[0];
      if (file && editingTemplate.parse_status === "PENDING") {
        const fd = new FormData();
        fd.append("file", file);
        await apiFetch(`/api/admin/templates/${editingTemplate.id}/file`, {
          method: "PUT",
          formData: fd,
        });
      }
    },
    onSuccess: () => {
      closeEditModal();
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err) => {
      window.alert(err instanceof ApiRequestError ? err.message : t("admin.common.saveFailed"));
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (err) => {
      window.alert(err instanceof ApiRequestError ? err.message : t("admin.common.deleteFailed"));
    },
  });

  const reparseMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/admin/templates/${id}/reparse`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["templates"] }),
    onError: (err) => {
      window.alert(err instanceof ApiRequestError ? err.message : t("admin.templates.reparseFailed"));
    },
  });

  function openCreateModal() {
    uploadMut.reset();
    setCreateForm(EMPTY_FORM);
    setCreateFileName("");
    if (createFileRef.current) createFileRef.current.value = "";
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    uploadMut.reset();
    setShowCreateModal(false);
    setCreateForm(EMPTY_FORM);
    setCreateFileName("");
    if (createFileRef.current) createFileRef.current.value = "";
  }

  function openEdit(t: PolicyTemplate) {
    editMut.reset();
    setEditingTemplate(t);
    setEditForm({ template_name: t.template_name, company_id: t.company_id });
    setEditFileName("");
    if (editFileRef.current) editFileRef.current.value = "";
  }

  function closeEditModal() {
    editMut.reset();
    setEditingTemplate(null);
    setEditForm(EMPTY_FORM);
    setEditFileName("");
    if (editFileRef.current) editFileRef.current.value = "";
  }

  function runSearch() {
    setKeyword(searchInput.trim());
    setPage(1);
  }

  const filtered = useMemo(() => {
    const list = templates.data ?? [];
    if (!keyword) return list;
    const kw = keyword.toLowerCase();
    return list.filter(
      (t) =>
        t.template_name.toLowerCase().includes(kw) ||
        companyName(t.company_id).toLowerCase().includes(kw),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.data, keyword, companies.data]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const canCreate =
    !!createForm.company_id &&
    !!createForm.template_name &&
    !!createFileName &&
    !uploadMut.isPending;
  const canEdit =
    !!editForm.template_name && !!editForm.company_id && !editMut.isPending;

  return (
    <div>
      <PageHeader
        title={t("admin.templates.title")}
        description={t("admin.templates.description")}
        action={<Button onClick={openCreateModal}>{t("admin.templates.add")}</Button>}
      />

      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center gap-2">
            <Input
              className="max-w-xs"
              placeholder={t("admin.templates.searchPlaceholder")}
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

          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-[var(--color-muted-foreground)]">
              <tr>
                <th className="py-2">{t("admin.templates.name")}</th>
                <th className="py-2">{t("admin.templates.company")}</th>
                <th className="py-2">{t("admin.templates.version")}</th>
                <th className="py-2">{t("admin.templates.pages")}</th>
                <th className="py-2">{t("admin.templates.parseStatus")}</th>
                <th className="py-2">{t("admin.templates.published")}</th>
                <th className="py-2 text-right">{t("admin.common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="py-2.5">{t.template_name}</td>
                  <td className="py-2.5">{companyName(t.company_id)}</td>
                  <td className="py-2.5">{t.version}</td>
                  <td className="py-2.5">{t.page_count}</td>
                  <td className="py-2.5">
                    <Badge variant={STATUS_VARIANT[t.parse_status]}>
                      {translate(`admin.templates.status.${t.parse_status}`)}
                    </Badge>
                    <TemplateParseStatus template={t} />
                  </td>
                  <td className="py-2.5">
                    {translate(t.is_active ? "admin.common.yes" : "admin.common.no")}
                  </td>
                  <td className="py-2.5 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      {t.parse_status === "PARSE_FAILED" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => reparseMut.mutate(t.id)}
                          disabled={reparseMut.isPending}
                        >
                          {translate("admin.templates.reparse")}
                        </Button>
                      )}
                      <Link href={`/admin/templates/${t.id}/annotate`}>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isParseActive(t.parse_status)}
                        >
                          {translate("admin.templates.annotatePublish")}
                        </Button>
                      </Link>
                      <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                        {translate("admin.common.edit")}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => setPendingDelete(t)}
                        disabled={deleteMut.isPending}
                      >
                        {translate("admin.common.delete")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {total === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-[var(--color-muted-foreground)]">
                    {t("admin.templates.empty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

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

      {showCreateModal && (
        <Modal title={t("admin.templates.add")} onClose={closeCreateModal}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.templates.company")}</Label>
              <SearchableSelect
                value={createForm.company_id}
                placeholder={t("admin.templates.selectCompany")}
                options={companyOptions}
                onChange={(v) => setCreateForm({ ...createForm, company_id: v })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.templates.templateName")}</Label>
              <Input
                value={createForm.template_name}
                onChange={(e) =>
                  setCreateForm({ ...createForm, template_name: e.target.value })
                }
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.templates.pdfFile")}</Label>
              <input
                ref={createFileRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setCreateFileName(e.target.files?.[0]?.name ?? "")}
              />
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => createFileRef.current?.click()}
                >
                  {createFileName
                    ? t("admin.templates.reselectPdf")
                    : t("admin.templates.selectPdf")}
                </Button>
                <span className="min-w-0 truncate text-sm text-[var(--color-muted-foreground)]">
                  {createFileName || t("admin.templates.noFile")}
                </span>
              </div>
            </div>
            {uploadMut.isError && (
              <p className="text-sm text-[var(--color-destructive)]">
                {uploadMut.error instanceof ApiRequestError
                  ? uploadMut.error.message
                  : (uploadMut.error as Error).message}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={closeCreateModal}>
                {t("admin.common.cancel")}
              </Button>
              <Button onClick={() => uploadMut.mutate()} disabled={!canCreate}>
                {uploadMut.isPending
                  ? t("admin.templates.uploading")
                  : t("admin.templates.uploadParse")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editingTemplate && (
        <Modal title={t("admin.templates.edit")} onClose={closeEditModal}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.templates.company")}</Label>
              <SearchableSelect
                value={editForm.company_id}
                placeholder={t("admin.templates.selectCompany")}
                options={companyOptions}
                onChange={(v) => setEditForm({ ...editForm, company_id: v })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("admin.templates.templateName")}</Label>
              <Input
                value={editForm.template_name}
                onChange={(e) =>
                  setEditForm({ ...editForm, template_name: e.target.value })
                }
              />
            </div>
            {editingTemplate.parse_status === "PENDING" && (
              <div className="flex flex-col gap-1.5">
                <Label>{t("admin.templates.replacePdf")}</Label>
                <input
                  ref={editFileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => setEditFileName(e.target.files?.[0]?.name ?? "")}
                />
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => editFileRef.current?.click()}
                  >
                    {editFileName
                      ? t("admin.templates.reselectPdf")
                      : t("admin.templates.selectReplacement")}
                  </Button>
                  <span className="min-w-0 truncate text-sm text-[var(--color-muted-foreground)]">
                    {editFileName || t("admin.templates.noFile")}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-muted-foreground)]">
                  {t("admin.templates.replaceHint")}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={closeEditModal}>
                {t("admin.common.cancel")}
              </Button>
              <Button onClick={() => editMut.mutate()} disabled={!canEdit}>
                {editMut.isPending
                  ? t("admin.templates.saving")
                  : t("admin.common.saveChanges")}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title={t("admin.templates.deleteTitle")}
        description={
          pendingDelete
            ? t("admin.templates.deleteDescription", { name: pendingDelete.template_name })
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
