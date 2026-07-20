"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useState } from "react";

import { IgnoreFieldDialog } from "@/components/annotator/IgnoreFieldDialog";
import type { NewBox } from "@/components/annotator/PdfCanvas";
import { StandardFieldPicker } from "@/components/annotator/StandardFieldPicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Toast, type ToastVariant } from "@/components/ui/toast";
import { getMappingTypeWarning } from "@/lib/field-type-compat";
import {
  FIELD_STATUS_DOT,
  FIELD_STATUS_LABEL,
  fieldDisplayStatus,
  isFieldProcessed,
} from "@/lib/field-status";
import { apiFetch, ApiRequestError, resolveApiBaseUrl } from "@/lib/api/client";
import type {
  InsuranceCompany,
  Page,
  PolicyTemplate,
  PublishPreview,
  StandardField,
  TemplateField,
} from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

function PdfLoading() {
  const { t } = useI18n();
  return <p className="p-4 text-sm">{t("admin.annotate.loadingPdf")}</p>;
}

const PdfCanvas = dynamic(
  () => import("@/components/annotator/PdfCanvas").then((m) => m.PdfCanvas),
  { ssr: false, loading: PdfLoading },
);

const FIELD_TYPE_OPTIONS = [
  "text",
  "checkbox",
  "radio",
  "date",
  "signature",
  "image",
];

type MappingTab = "standard" | "fixed" | "template-ai";

function resolvePdfUrl(url: string): string {
  if (!url.startsWith("/local-storage")) return url;
  const base = resolveApiBaseUrl();
  return base ? `${base}${url}` : url;
}

export default function AnnotatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { t } = useI18n();
  const { id } = use(params);
  const templateId = Number(id);
  const qc = useQueryClient();
  const router = useRouter();
  const [pageNo, setPageNo] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedToast, setPublishedToast] = useState(false);
  const [actionToast, setActionToast] = useState<{
    id: number;
    message: string;
    variant: ToastVariant;
  } | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [continuousDraw, setContinuousDraw] = useState(false);
  const [canvasHint, setCanvasHint] = useState<string | null>(null);

  function showActionToast(message: string, variant: ToastVariant) {
    setActionToast({ id: Date.now(), message, variant });
  }

  const template = useQuery({
    queryKey: ["template", templateId],
    queryFn: () => apiFetch<PolicyTemplate>(`/api/admin/templates/${templateId}`),
  });
  const companies = useQuery({
    queryKey: ["insurance-companies"],
    queryFn: () =>
      apiFetch<Page<InsuranceCompany>>("/api/admin/insurance-companies", {
        query: { page_size: 100 },
      }),
  });
  const fields = useQuery({
    queryKey: ["template-fields", templateId],
    queryFn: () =>
      apiFetch<TemplateField[]>(`/api/admin/templates/${templateId}/fields`),
  });
  const standardFields = useQuery({
    queryKey: ["standard-fields"],
    queryFn: () => apiFetch<StandardField[]>("/api/admin/standard-fields"),
  });

  const selected = useMemo(
    () => fields.data?.find((f) => f.id === selectedId) ?? null,
    [fields.data, selectedId],
  );

  const companyName =
    companies.data?.items.find((c) => c.id === template.data?.company_id)?.company_name ??
    "";

  const createFieldMut = useMutation({
    mutationFn: (box: NewBox) =>
      apiFetch<TemplateField>(`/api/admin/templates/${templateId}/fields`, {
        method: "POST",
        body: {
          page_no: box.pageNo,
          field_type: "text",
          pos_x: box.pos_x,
          pos_y: box.pos_y,
          width: box.width,
          height: box.height,
        },
      }),
    onSuccess: (f) => {
      qc.invalidateQueries({ queryKey: ["template-fields", templateId] });
      setSelectedId(f.id);
      if (!continuousDraw) setDrawMode(false);
    },
    onError: (e) => {
      const msg =
        e instanceof ApiRequestError
          ? e.message
          : e instanceof Error
            ? e.message
            : t("admin.annotate.createFailed");
      window.alert(msg);
    },
  });

  function showCanvasHint(message: string) {
    setCanvasHint(message);
    window.setTimeout(() => setCanvasHint(null), 2500);
  }

  function handleCreateBox(box: NewBox) {
    createFieldMut.mutate(box);
  }

  const deleteFieldMut = useMutation({
    mutationFn: (fieldId: number) =>
      apiFetch(`/api/admin/templates/${templateId}/fields/${fieldId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["template-fields", templateId] });
      setSelectedId(null);
      showActionToast(t("admin.annotate.deleteSuccess"), "success");
    },
    onError: (e) =>
      showActionToast(
        e instanceof ApiRequestError ? e.message : t("admin.annotate.deleteFailed"),
        "error",
      ),
  });

  const updateFieldMut = useMutation({
    mutationFn: (payload: {
      field: TemplateField;
      patch: Record<string, unknown>;
    }) =>
      apiFetch(`/api/admin/templates/${templateId}/fields/${payload.field.id}`, {
        method: "PUT",
        body: { row_version: payload.field.row_version, ...payload.patch },
      }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["template-fields", templateId] }),
  });

  const saveMappingMut = useMutation({
    mutationFn: (payload: {
      fieldId: number;
      standard_field_id: number | null;
      fixed_value: string | null;
      checkbox_map_value: string | null;
      template_specific_field_code: string | null;
      template_specific_ai_hint: string | null;
      confirm?: boolean;
    }) =>
      apiFetch(
        `/api/admin/templates/${templateId}/fields/${payload.fieldId}/mapping`,
        {
          method: "POST",
          body: {
            standard_field_id: payload.standard_field_id,
            fixed_value: payload.fixed_value,
            checkbox_map_value: payload.checkbox_map_value,
            template_specific_field_code: payload.template_specific_field_code,
            template_specific_ai_hint: payload.template_specific_ai_hint,
            confirm: payload.confirm ?? false,
          },
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["template-fields", templateId] });
      showActionToast(t("admin.annotate.mappingSuccess"), "success");
    },
    onError: (e) =>
      showActionToast(
        e instanceof ApiRequestError ? e.message : t("admin.annotate.mappingFailed"),
        "error",
      ),
  });

  const ignoreFieldMut = useMutation({
    mutationFn: (payload: { fieldId: number; row_version: number; reason: string | null }) =>
      apiFetch<TemplateField>(
        `/api/admin/templates/${templateId}/fields/${payload.fieldId}/ignore`,
        {
          method: "PATCH",
          body: { row_version: payload.row_version, reason: payload.reason },
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["template-fields", templateId] });
      showActionToast(t("admin.annotate.ignoreSuccess"), "success");
    },
    onError: (e) =>
      showActionToast(
        e instanceof ApiRequestError ? e.message : t("admin.annotate.ignoreFailed"),
        "error",
      ),
  });

  const restoreFieldMut = useMutation({
    mutationFn: (payload: { fieldId: number; row_version: number }) =>
      apiFetch<TemplateField>(
        `/api/admin/templates/${templateId}/fields/${payload.fieldId}/restore`,
        {
          method: "PATCH",
          body: { row_version: payload.row_version },
        },
      ),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["template-fields", templateId] }),
    onError: (e) =>
      window.alert(e instanceof ApiRequestError ? e.message : t("admin.annotate.restoreFailed")),
  });

  const publishMut = useMutation({
    mutationFn: () =>
      apiFetch(`/api/admin/templates/${templateId}/publish`, { method: "POST" }),
    onSuccess: () => {
      setPublishError(null);
      qc.invalidateQueries({ queryKey: ["template", templateId] });
      qc.invalidateQueries({ queryKey: ["templates"] });
      setPublishedToast(true);
    },
    onError: (e) =>
      setPublishError(e instanceof ApiRequestError ? e.message : t("admin.annotate.publishFailed")),
  });

  const pageCount = template.data?.page_count ?? 1;
  const pageFields = (fields.data ?? []).filter((f) => f.page_no === pageNo);
  const processedCount = fields.data?.filter(isFieldProcessed).length ?? 0;
  const totalCount = fields.data?.length ?? 0;
  const canPublish = totalCount > 0 && processedCount === totalCount;

  async function handlePublish() {
    setPublishError(null);
    try {
      const preview = await apiFetch<PublishPreview>(
        `/api/admin/templates/${templateId}/publish-preview`,
      );
      if (preview.pending_count > 0) {
        setPublishError(
          t("admin.annotate.pendingFields", { count: preview.pending_count }),
        );
        return;
      }
      if (preview.missing_required.length > 0) {
        const names = preview.missing_required.map((f) => f.field_name).join("、");
        const ok = window.confirm(
          t("admin.annotate.missingRequired", { names }),
        );
        if (!ok) return;
      }
      publishMut.mutate();
    } catch (e) {
      setPublishError(e instanceof ApiRequestError ? e.message : t("admin.annotate.publishCheckFailed"));
    }
  }

  const title = template.data
    ? t("admin.annotate.titleDetail", {
        company: companyName,
        template: template.data.template_name,
        version: template.data.version,
      })
    : t("admin.annotate.title");

  return (
    <div className="-m-8 flex h-screen flex-col overflow-hidden bg-[var(--color-background)]">
      {actionToast && (
        <Toast
          key={actionToast.id}
          message={actionToast.message}
          variant={actionToast.variant}
          duration={2000}
          onDismiss={() => setActionToast(null)}
        />
      )}
      {publishedToast && (
        <Toast
          message={t("admin.annotate.published")}
          variant="success"
          duration={2000}
          onDismiss={() => {
            setPublishedToast(false);
            router.back();
          }}
        />
      )}
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/admin/templates">
            <Button variant="outline" size="sm">
              {t("admin.annotate.back")}
            </Button>
          </Link>
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {template.data && (
            <Badge variant={template.data.is_active ? "success" : "secondary"}>
              {t(`admin.templates.status.${template.data.parse_status}`)}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-[var(--color-muted-foreground)]">
              {t("admin.annotate.processed", { processed: processedCount, total: totalCount })}
            </span>
            <div className="h-2 w-32 overflow-hidden rounded-full bg-[var(--color-muted)]">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{
                  width: totalCount ? `${(processedCount / totalCount) * 100}%` : "0%",
                }}
              />
            </div>
          </div>
          <Button
            onClick={() => void handlePublish()}
            disabled={!canPublish || publishMut.isPending}
          >
            {t("admin.annotate.publish")}
          </Button>
        </div>
      </header>

      {publishError && (
        <p className="shrink-0 border-b bg-red-50 px-4 py-2 text-sm text-red-700">
          {publishError}
        </p>
      )}

      {/* Three-column workspace */}
      <div className="flex min-h-0 flex-1">
        {/* Field list */}
        <aside className="flex w-56 shrink-0 flex-col border-r lg:w-64">
          <div className="border-b px-3 py-2.5 text-xs font-medium text-[var(--color-muted-foreground)]">
            {t("admin.annotate.fieldList", { page: pageNo, count: pageFields.length })}
          </div>
          <div className="flex-1 overflow-y-auto">
            {pageFields.map((f) => {
              const status = fieldDisplayStatus(f);
              const label =
                f.field_label_raw ??
                f.pdf_field_name ??
                t("admin.annotate.fieldFallback", { id: f.id });
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className={`flex w-full items-center gap-2 border-b px-3 py-2.5 text-left text-sm hover:bg-[var(--color-muted)] ${
                    f.id === selectedId ? "bg-[var(--color-muted)]" : ""
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${FIELD_STATUS_DOT[status]}`} />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
            {pageFields.length === 0 && (
              <p className="p-4 text-center text-xs text-[var(--color-muted-foreground)]">
                {t("admin.annotate.emptyPage")}
              </p>
            )}
          </div>
          <div className="border-t px-3 py-2 text-[10px] text-[var(--color-muted-foreground)]">
            {(Object.keys(FIELD_STATUS_LABEL) as Array<keyof typeof FIELD_STATUS_LABEL>).map(
              (key) => (
                <div key={key} className={`flex items-center gap-1.5 ${key !== "mapped" ? "mt-1" : ""}`}>
                  <span className={`h-2 w-2 rounded-full ${FIELD_STATUS_DOT[key]}`} />{" "}
                  {t(`admin.annotate.status.${key}`)}
                </div>
              ),
            )}
          </div>
        </aside>

        {/* PDF preview */}
        <main className="relative min-w-0 flex-1 overflow-hidden bg-[var(--color-muted)]/30 p-4">
          {canvasHint && (
            <div className="absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 shadow-sm">
              {canvasHint}
            </div>
          )}
          {template.data && (
            <PdfCanvas
              pdfUrl={resolvePdfUrl(template.data.original_pdf_url)}
              pageNo={pageNo}
              pageCount={pageCount}
              fields={fields.data ?? []}
              selectedId={selectedId}
              drawMode={drawMode}
              onDrawModeChange={setDrawMode}
              continuousDraw={continuousDraw}
              onContinuousDrawChange={setContinuousDraw}
              onSelect={setSelectedId}
              onCreateBox={handleCreateBox}
              onCreateTooSmall={() => showCanvasHint(t("admin.annotate.tooSmall"))}
              onPageChange={setPageNo}
            />
          )}
        </main>

        {/* Selected field details */}
        <aside className="flex w-[26rem] shrink-0 flex-col border-l lg:w-[30rem]">
          <div className="border-b px-4 py-3 text-sm font-medium">
            {t("admin.annotate.selectedField")}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {!selected ? (
              <p className="text-sm text-[var(--color-muted-foreground)]">
                {t("admin.annotate.selectFieldHint")}
              </p>
            ) : (
              <FieldPanel
                key={selected.id}
                field={selected}
                standardFields={standardFields.data ?? []}
                saving={
                  updateFieldMut.isPending ||
                  saveMappingMut.isPending ||
                  ignoreFieldMut.isPending ||
                  restoreFieldMut.isPending
                }
                onChangeType={(fieldType) =>
                  updateFieldMut.mutate(
                    { field: selected, patch: { field_type: fieldType } },
                    {
                      onError: (e) =>
                        window.alert(
                          e instanceof ApiRequestError ? e.message : t("admin.common.saveFailed"),
                        ),
                    },
                  )
                }
                onUpdateCoords={(coords) =>
                  updateFieldMut.mutate(
                    { field: selected, patch: coords },
                    {
                      onError: (e) =>
                        window.alert(
                          e instanceof ApiRequestError ? e.message : t("admin.common.saveFailed"),
                        ),
                    },
                  )
                }
                onConfirmMapping={async (mapping) => {
                  await saveMappingMut.mutateAsync({
                    fieldId: selected.id,
                    ...mapping,
                    confirm: true,
                  });
                }}
                onIgnore={(reason) =>
                  ignoreFieldMut.mutate({
                    fieldId: selected.id,
                    row_version: selected.row_version,
                    reason,
                  })
                }
                onRestore={() =>
                  restoreFieldMut.mutate({
                    fieldId: selected.id,
                    row_version: selected.row_version,
                  })
                }
                onDelete={() => deleteFieldMut.mutate(selected.id)}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function FieldPanel({
  field,
  standardFields,
  onChangeType,
  onUpdateCoords,
  onConfirmMapping,
  onIgnore,
  onRestore,
  onDelete,
  saving,
}: {
  field: TemplateField;
  standardFields: StandardField[];
  onChangeType: (t: string) => void;
  onUpdateCoords: (c: {
    pos_x: number;
    pos_y: number;
    width: number;
    height: number;
  }) => void;
  onConfirmMapping: (p: {
    standard_field_id: number | null;
    fixed_value: string | null;
    checkbox_map_value: string | null;
    template_specific_field_code: string | null;
    template_specific_ai_hint: string | null;
  }) => void | Promise<void>;
  onIgnore: (reason: string | null) => void;
  onRestore: () => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const { locale, t } = useI18n();
  const [stdId, setStdId] = useState<number | null>(
    field.mapping?.standard_field_id ?? null,
  );
  const [fixedValue, setFixedValue] = useState(field.mapping?.fixed_value ?? "");
  const [checkboxValue, setCheckboxValue] = useState(
    field.mapping?.checkbox_map_value ?? "",
  );
  const [templateFieldCode, setTemplateFieldCode] = useState(
    field.mapping?.template_specific_field_code ?? "",
  );
  const [templateAiHint, setTemplateAiHint] = useState(
    field.mapping?.template_specific_ai_hint ?? "",
  );
  const [coords, setCoords] = useState({
    pos_x: field.pos_x,
    pos_y: field.pos_y,
    width: field.width,
    height: field.height,
  });

  const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false);
  const [coordsOpen, setCoordsOpen] = useState(false);

  const resolvedMappingTab = useMemo<MappingTab>(() => {
    if (stdId) return "standard";
    if (fixedValue.trim()) return "fixed";
    if (templateFieldCode.trim() && templateAiHint.trim()) return "template-ai";
    return "standard";
  }, [stdId, fixedValue, templateFieldCode, templateAiHint]);
  const [activeMappingTab, setActiveMappingTab] =
    useState<MappingTab>(resolvedMappingTab);

  useEffect(() => {
    setStdId(field.mapping?.standard_field_id ?? null);
    setFixedValue(field.mapping?.fixed_value ?? "");
    setCheckboxValue(field.mapping?.checkbox_map_value ?? "");
    setTemplateFieldCode(field.mapping?.template_specific_field_code ?? "");
    setTemplateAiHint(field.mapping?.template_specific_ai_hint ?? "");
    setActiveMappingTab(
      field.mapping?.standard_field_id
        ? "standard"
        : field.mapping?.fixed_value
          ? "fixed"
          : field.mapping?.template_specific_field_code ||
              field.mapping?.template_specific_ai_hint
            ? "template-ai"
            : "standard",
    );
  }, [
    field.id,
    field.mapping?.standard_field_id,
    field.mapping?.fixed_value,
    field.mapping?.checkbox_map_value,
    field.mapping?.template_specific_field_code,
    field.mapping?.template_specific_ai_hint,
    field.row_version,
    field.field_status,
  ]);

  useEffect(() => {
    setCoords({
      pos_x: field.pos_x,
      pos_y: field.pos_y,
      width: field.width,
      height: field.height,
    });
  }, [field.pos_x, field.pos_y, field.width, field.height]);

  const displayName =
    field.field_label_raw ??
    field.pdf_field_name ??
    t("admin.annotate.fieldFallback", { id: field.id });

  const selectedStandard = useMemo(
    () => (stdId ? standardFields.find((f) => f.id === stdId) : null),
    [stdId, standardFields],
  );

  const typeMismatchWarning = useMemo(() => {
    if (!selectedStandard) return null;
    return getMappingTypeWarning(field.field_type, selectedStandard.data_type, locale);
  }, [field.field_type, locale, selectedStandard]);

  function applyCoords() {
    onUpdateCoords(coords);
  }

  function handleSelectStandard(id: number | null) {
    setStdId(id);
  }

  function handleFixedValueChange(value: string) {
    setFixedValue(value);
  }

  function handleTemplateFieldCodeChange(value: string) {
    setTemplateFieldCode(value);
  }

  function handleTemplateAiHintChange(value: string) {
    setTemplateAiHint(value);
  }

  function switchMappingTab(tab: MappingTab) {
    setActiveMappingTab(tab);
  }

  function clearInactiveMappingValues(activeTab: MappingTab) {
    if (activeTab === "standard") {
      setFixedValue("");
      setTemplateFieldCode("");
      setTemplateAiHint("");
      return;
    }
    if (activeTab === "fixed") {
      setStdId(null);
      setTemplateFieldCode("");
      setTemplateAiHint("");
      return;
    }
    setStdId(null);
    setFixedValue("");
  }

  const canConfirmMapping =
    activeMappingTab === "standard"
      ? stdId != null
      : activeMappingTab === "fixed"
        ? fixedValue.trim().length > 0
        : templateFieldCode.trim().length > 0 && templateAiHint.trim().length > 0;

  const isIgnored = field.field_status === "IGNORED";

  if (isIgnored) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-base font-semibold">{displayName}</div>
          <div className="mt-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-700">
            {t("admin.annotate.ignored")}
            {field.ignore_reason && (
              <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">
                {t("admin.annotate.reason", { reason: field.ignore_reason })}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button className="flex-1" disabled={saving} onClick={onRestore}>
            {t("admin.annotate.restore")}
          </Button>
          <Button variant="outline" className="text-red-600" onClick={onDelete}>
            {t("admin.annotate.deleteField")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 overflow-x-hidden flex flex-col gap-4">
      <div>
        <div className="text-base font-semibold">{displayName}</div>
        {field.confidence_score != null && (
          <div className="mt-1 text-xs text-[var(--color-muted-foreground)]">
            {t("admin.annotate.sourceConfidence", {
              source: field.recognize_source,
              confidence: field.confidence_score,
            })}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("admin.annotate.fieldType")}</Label>
        <select
          className="h-9 rounded-lg border border-[var(--color-input)] bg-transparent px-3 text-sm"
          value={field.field_type}
          onChange={(e) => onChangeType(e.target.value)}
        >
          {FIELD_TYPE_OPTIONS.map((type) => (
            <option key={type} value={type}>
              {t(`admin.annotate.fieldType.${type}`)}
            </option>
          ))}
        </select>
      </div>

      {/* Mutually exclusive mapping methods */}
      <div className="flex flex-col gap-2">
        <Label>{t("admin.annotate.mappingMethod")}</Label>
        <div className="rounded-lg border border-[var(--color-border)]">
          <div className="grid grid-cols-3 border-b border-[var(--color-border)] bg-[var(--color-muted)]/30">
            {[
              { key: "standard", label: t("admin.annotate.standardField") },
              { key: "fixed", label: t("admin.annotate.fixedValue") },
              { key: "template-ai", label: t("admin.annotate.templateAi") },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`px-3 py-2 text-sm transition-colors ${
                  activeMappingTab === tab.key
                    ? "bg-[var(--color-surface)] font-medium text-[var(--color-foreground)]"
                    : "text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                }`}
                onClick={() => switchMappingTab(tab.key as MappingTab)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-3">
            {activeMappingTab === "standard" && (
              <div className="flex flex-col gap-1.5">
                <Label>{t("admin.annotate.mapToStandard")}</Label>
                <StandardFieldPicker
                  fields={standardFields}
                  value={stdId}
                  onChange={handleSelectStandard}
                />
                {typeMismatchWarning && (
                  <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    {t("admin.annotate.typeMismatch", {
                      standardType: selectedStandard?.data_type ?? "",
                      fieldType: field.field_type,
                    })}
                  </div>
                )}
              </div>
            )}

            {activeMappingTab === "fixed" && (
              <div className="flex flex-col gap-1.5">
                <Label>{t("admin.annotate.fixedValue")}</Label>
                <Input
                  value={fixedValue}
                  onChange={(e) => handleFixedValueChange(e.target.value)}
                  placeholder={t("admin.annotate.fixedPlaceholder")}
                />
              </div>
            )}

            {activeMappingTab === "template-ai" && (
              <div className="grid grid-cols-1 gap-3">
                <div className="flex flex-col gap-1">
                  <Label>{t("admin.annotate.fieldProperty")}</Label>
                  <Input
                    value={templateFieldCode}
                    onChange={(e) => handleTemplateFieldCodeChange(e.target.value)}
                    placeholder={t("admin.annotate.fieldPropertyPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>{t("admin.annotate.aiHint")}</Label>
                  <textarea
                    value={templateAiHint}
                    onChange={(e) => handleTemplateAiHintChange(e.target.value)}
                    placeholder={t("admin.annotate.aiHintPlaceholder")}
                    rows={3}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {(field.field_type === "checkbox" || field.field_type === "radio") && (
        <div className="flex flex-col gap-1.5">
          <Label>{t("admin.annotate.checkboxValue")}</Label>
          <Input value={checkboxValue} onChange={(e) => setCheckboxValue(e.target.value)} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          className="flex items-center justify-between text-sm"
          onClick={() => setCoordsOpen((o) => !o)}
        >
          <Label className="cursor-pointer">{t("admin.annotate.coordinates")}</Label>
          <span className="text-xs text-[var(--color-muted-foreground)]">
            {t(coordsOpen ? "admin.annotate.collapse" : "admin.annotate.expand")}
          </span>
        </button>
        {coordsOpen && (
          <div className="grid grid-cols-2 gap-2">
            {(["pos_x", "pos_y", "width", "height"] as const).map((key) => (
              <div key={key} className="flex flex-col gap-0.5">
                <span className="text-[10px] text-[var(--color-muted-foreground)]">
                  {key === "pos_x" ? "x" : key === "pos_y" ? "y" : key === "width" ? "w" : "h"}
                </span>
                <Input
                  type="number"
                  step="0.1"
                  value={coords[key]}
                  onChange={(e) =>
                    setCoords({ ...coords, [key]: parseFloat(e.target.value) || 0 })
                  }
                  onBlur={applyCoords}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-2">
        <Button
          variant="outline"
          className="text-red-600 hover:text-red-700"
          onClick={onDelete}
        >
          {t("admin.annotate.deleteField")}
        </Button>
        <Button variant="outline" disabled={saving} onClick={() => setIgnoreDialogOpen(true)}>
          {t("admin.annotate.ignoreField")}
        </Button>
        <Button
          className="flex-1"
          disabled={saving || !canConfirmMapping}
          onClick={async () => {
            try {
              await onConfirmMapping({
                standard_field_id: activeMappingTab === "standard" ? stdId : null,
                fixed_value: activeMappingTab === "fixed" ? fixedValue.trim() : null,
                checkbox_map_value: checkboxValue || null,
                template_specific_field_code:
                  activeMappingTab === "template-ai" ? templateFieldCode.trim() : null,
                template_specific_ai_hint:
                  activeMappingTab === "template-ai" ? templateAiHint.trim() : null,
              });
              clearInactiveMappingValues(activeMappingTab);
            } catch {}
          }}
        >
          {t("admin.annotate.confirmMapping")}
        </Button>
      </div>

      <IgnoreFieldDialog
        open={ignoreDialogOpen}
        onOpenChange={setIgnoreDialogOpen}
        saving={saving}
        onConfirm={onIgnore}
      />
    </div>
  );
}
