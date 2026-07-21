"use client";

// Annotate workspace — three-column layout ported from
// backend/apps/web templates annotate, restyled for the admin console:
// field list | PDF canvas (draw-to-create) | selected-field panel.

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "@acuity/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmGateDialog,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acuity/ui";
import type { TemplateFieldOut, TemplateFieldType } from "@acuity/types";
import { AcuityIcon } from "@acuity/ui";
import { useToast } from "@acuity/ui";
import {
  createTemplateFieldAction,
  deleteTemplateFieldAction,
  ignoreFieldAction,
  publishTemplateAction,
  refreshTemplateFieldsAction,
  restoreFieldAction,
  saveFieldMappingAction,
  updateTemplateFieldAction,
} from "@/lib/actions";
import {
  FIELD_STATUS_DOT,
  fieldDisplayStatus,
  isFieldProcessed,
  type FieldDisplayStatus,
} from "@/components/forms/field-status";
import type { NewBox } from "@/components/forms/pdf-annotator-canvas";
import {
  StandardFieldPicker,
  type StandardFieldOption,
} from "@/components/forms/standard-field-picker";

const PdfAnnotatorCanvas = dynamic(
  () => import("@/components/forms/pdf-annotator-canvas").then((m) => m.PdfAnnotatorCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">…</div>
    ),
  },
);

const FIELD_TYPES: TemplateFieldType[] = ["text", "date", "checkbox", "radio", "image", "signature"];

const STATUS_KEYS: FieldDisplayStatus[] = ["mapped", "pending_confirm", "ignored", "unhandled"];

interface TemplateInfo {
  id: number;
  code: string;
  name: string;
  version: string;
  page_count: number;
  insurer: string;
  pdf_url: string;
}

export function AnnotateWorkspace({
  template,
  initialFields,
  standardFields,
}: {
  template: TemplateInfo;
  initialFields: TemplateFieldOut[];
  standardFields: StandardFieldOption[];
}) {
  const t = useTranslations("editor");
  const ta = useTranslations("editor.annotate");
  const router = useRouter();
  const { showToast } = useToast();
  const [fields, setFields] = useState(initialFields);
  const [pageNo, setPageNo] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [drawMode, setDrawMode] = useState(false);
  const [continuousDraw, setContinuousDraw] = useState(false);
  const [canvasHint, setCanvasHint] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setFields(initialFields);
  }, [initialFields]);

  const selected = useMemo(
    () => fields.find((f) => f.id === selectedId) ?? null,
    [fields, selectedId],
  );
  const pageFields = fields.filter((f) => f.page_no === pageNo);
  const processedCount = fields.filter(isFieldProcessed).length;
  const totalCount = fields.length;
  const canPublish = totalCount > 0 && processedCount === totalCount;
  const pageCount = Math.max(template.page_count || 1, 1);

  function showHint(message: string) {
    setCanvasHint(message);
    window.setTimeout(() => setCanvasHint(null), 2500);
  }

  async function reloadFields() {
    const result = await refreshTemplateFieldsAction(template.id);
    if (result.ok && result.data) setFields(result.data);
  }

  function handleCreateBox(box: NewBox) {
    startTransition(async () => {
      const result = await createTemplateFieldAction(template.id, {
        page_no: box.pageNo,
        field_type: "text",
        pos_x: box.pos_x,
        pos_y: box.pos_y,
        width: box.width,
        height: box.height,
        font_size: 10,
      });
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      await reloadFields();
      if (result.data) setSelectedId(result.data.id);
      if (!continuousDraw) setDrawMode(false);
    });
  }

  function handlePublish() {
    startTransition(async () => {
      const result = await publishTemplateAction(template.id);
      if (result.ok) {
        showToast(t("published", { name: template.name }));
        setPublishOpen(false);
        router.push("/forms?tab=library");
      } else {
        showToast(result.message, "error");
      }
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>
            {ta("processed", { processed: processedCount, total: totalCount })}
          </span>
          <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-tone-success transition-all"
              style={{ width: totalCount ? `${(processedCount / totalCount) * 100}%` : "0%" }}
            />
          </div>
        </div>
        <Button type="button" size="sm" disabled={!canPublish || pending} onClick={() => setPublishOpen(true)}>
          {t("confirm-publish")}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Field list */}
        <aside className="flex w-56 shrink-0 flex-col border-r border-border lg:w-64">
          <div className="border-b border-border px-3 py-2.5 text-xs font-medium text-muted-foreground">
            {ta("field-list", { page: pageNo, count: pageFields.length })}
          </div>
          <div className="slim-scroll min-h-0 flex-1 overflow-y-auto">
            {pageFields.map((f) => {
              const status = fieldDisplayStatus(f);
              const label = f.field_label_raw ?? f.pdf_field_name ?? ta("field-fallback", { id: f.id });
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedId(f.id)}
                  className={`flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left text-sm hover:bg-accent ${
                    f.id === selectedId ? "bg-accent" : ""
                  }`}
                >
                  <span className={`size-2 shrink-0 rounded-full ${FIELD_STATUS_DOT[status]}`} />
                  <span className="truncate text-foreground">{label}</span>
                </button>
              );
            })}
            {pageFields.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">{ta("empty-page")}</p>
            ) : null}
          </div>
          <div className="border-t border-border px-3 py-2 text-[10px] text-muted-foreground">
            {STATUS_KEYS.map((key) => (
              <div key={key} className="mt-1 flex items-center gap-1.5 first:mt-0">
                <span className={`size-2 rounded-full ${FIELD_STATUS_DOT[key]}`} />
                {ta(`status.${key}`)}
              </div>
            ))}
          </div>
        </aside>

        {/* PDF */}
        <main className="relative min-w-0 flex-1 overflow-hidden bg-muted/40 p-4">
          {canvasHint ? (
            <div className="absolute left-1/2 top-6 z-10 -translate-x-1/2 rounded-lg border border-tone-warning bg-tone-warning/15 px-4 py-2 text-sm text-foreground shadow-sm">
              {canvasHint}
            </div>
          ) : null}
          {template.pdf_url ? (
            <PdfAnnotatorCanvas
              pdfUrl={template.pdf_url}
              pageNo={pageNo}
              pageCount={pageCount}
              fields={fields}
              selectedId={selectedId}
              drawMode={drawMode}
              onDrawModeChange={setDrawMode}
              continuousDraw={continuousDraw}
              onContinuousDrawChange={setContinuousDraw}
              onSelect={setSelectedId}
              onCreateBox={handleCreateBox}
              onCreateTooSmall={() => showHint(ta("too-small"))}
              onPageChange={setPageNo}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t("pdf-missing")}
            </div>
          )}
        </main>

        {/* Selected field */}
        <aside className="flex w-[22rem] shrink-0 flex-col border-l border-border lg:w-[26rem]">
          <div className="border-b border-border px-4 py-3 text-sm font-medium text-foreground">
            {ta("selected-field")}
          </div>
          <div className="slim-scroll min-h-0 flex-1 overflow-y-auto p-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">{ta("select-hint")}</p>
            ) : (
              <FieldPanel
                key={selected.id}
                templateId={template.id}
                field={selected}
                standardFields={standardFields}
                onChanged={async () => {
                  await reloadFields();
                }}
                onDeleted={() => {
                  setSelectedId(null);
                  void reloadFields();
                }}
              />
            )}
          </div>
        </aside>
      </div>

      <ConfirmGateDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={t("publish-title")}
        description={t("publish-feedforward", { name: template.name })}
        variant="ack"
        icon={<AcuityIcon name="shield" size={20} />}
        strings={{
          confirmLabel: t("publish-confirm"),
          cancelLabel: t("cancel"),
          ackLabel: t("publish-ack"),
        }}
        onConfirm={handlePublish}
      />
    </div>
  );
}

type MappingTab = "standard" | "fixed" | "template-ai";

function FieldPanel({
  templateId,
  field,
  standardFields,
  onChanged,
  onDeleted,
}: {
  templateId: number;
  field: TemplateFieldOut;
  standardFields: StandardFieldOption[];
  onChanged: () => Promise<void>;
  onDeleted: () => void;
}) {
  const t = useTranslations("editor");
  const ta = useTranslations("editor.annotate");
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [stdId, setStdId] = useState<number | null>(field.mapping?.standard_field_id ?? null);
  const [fixedValue, setFixedValue] = useState(field.mapping?.fixed_value ?? "");
  const [checkboxValue, setCheckboxValue] = useState(field.mapping?.checkbox_map_value ?? "");
  const [templateFieldCode, setTemplateFieldCode] = useState(
    field.mapping?.template_specific_field_code ?? "",
  );
  const [templateAiHint, setTemplateAiHint] = useState(field.mapping?.template_specific_ai_hint ?? "");
  const [coords, setCoords] = useState({
    pos_x: field.pos_x,
    pos_y: field.pos_y,
    width: field.width,
    height: field.height,
  });
  const [coordsOpen, setCoordsOpen] = useState(false);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const [ignoreReason, setIgnoreReason] = useState("");
  const [activeMappingTab, setActiveMappingTab] = useState<MappingTab>(() => {
    if (field.mapping?.standard_field_id) return "standard";
    if (field.mapping?.fixed_value) return "fixed";
    if (field.mapping?.template_specific_field_code || field.mapping?.template_specific_ai_hint) {
      return "template-ai";
    }
    return "standard";
  });

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
          : field.mapping?.template_specific_field_code || field.mapping?.template_specific_ai_hint
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

  useEffect(() => {
    if (ignoreOpen) setIgnoreReason("");
  }, [ignoreOpen]);

  const label = field.field_label_raw ?? field.pdf_field_name ?? ta("field-fallback", { id: field.id });
  const ignored = field.field_status === "IGNORED";
  const selectedStandard = stdId ? standardFields.find((f) => f.id === stdId) : null;

  const canConfirmMapping =
    activeMappingTab === "standard"
      ? stdId != null
      : activeMappingTab === "fixed"
        ? fixedValue.trim().length > 0
        : templateFieldCode.trim().length > 0 && templateAiHint.trim().length > 0;

  function saveType(next: TemplateFieldType) {
    startTransition(async () => {
      const result = await updateTemplateFieldAction(templateId, field.id, {
        row_version: field.row_version,
        field_type: next,
      });
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      await onChanged();
      showToast(t("draft-saved-toast"));
    });
  }

  function applyCoords() {
    startTransition(async () => {
      const result = await updateTemplateFieldAction(templateId, field.id, {
        row_version: field.row_version,
        ...coords,
      });
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      await onChanged();
    });
  }

  function confirmMapping() {
    startTransition(async () => {
      const result = await saveFieldMappingAction(templateId, field.id, {
        standard_field_id: activeMappingTab === "standard" ? stdId : null,
        fixed_value: activeMappingTab === "fixed" ? fixedValue.trim() : null,
        checkbox_map_value: checkboxValue.trim() || null,
        template_specific_field_code:
          activeMappingTab === "template-ai" ? templateFieldCode.trim() : null,
        template_specific_ai_hint: activeMappingTab === "template-ai" ? templateAiHint.trim() : null,
        confirm: true,
      });
      if (!result.ok) {
        showToast(result.message, "error");
        return;
      }
      if (activeMappingTab === "standard") {
        setFixedValue("");
        setTemplateFieldCode("");
        setTemplateAiHint("");
      } else if (activeMappingTab === "fixed") {
        setStdId(null);
        setTemplateFieldCode("");
        setTemplateAiHint("");
      } else {
        setStdId(null);
        setFixedValue("");
      }
      await onChanged();
      showToast(ta("mapping-saved"));
    });
  }

  if (ignored) {
    return (
      <div className="flex flex-col gap-4">
        <div>
          <div className="text-base font-semibold text-foreground">{label}</div>
          <div className="mt-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            {ta("status.ignored")}
            {field.ignore_reason ? (
              <p className="mt-1 text-xs">{ta("reason", { reason: field.ignore_reason })}</p>
            ) : null}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await restoreFieldAction(templateId, field.id, field.row_version);
                if (!result.ok) showToast(result.message, "error");
                else {
                  await onChanged();
                  showToast(ta("restored"));
                }
              })
            }
          >
            {t("restore")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="text-destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await deleteTemplateFieldAction(templateId, field.id);
                if (!result.ok) showToast(result.message, "error");
                else {
                  showToast(ta("deleted"));
                  onDeleted();
                }
              })
            }
          >
            {ta("delete")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-4 overflow-x-hidden">
      <div>
        <div className="text-base font-semibold text-foreground">{label}</div>
        {field.confidence_score != null ? (
          <div className="mt-1 text-xs text-muted-foreground">
            {ta("source-confidence", {
              source: field.recognize_source,
              confidence: Math.round(field.confidence_score),
            })}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">{t("field-type")}</label>
        <Select
          value={field.field_type}
          onValueChange={(v) => saveType(v as TemplateFieldType)}
          disabled={pending}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FIELD_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`type-${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium text-muted-foreground">{ta("mapping-method")}</label>
        <div className="rounded-lg border border-border">
          <div className="grid grid-cols-3 border-b border-border bg-muted/30">
            {(
              [
                { key: "standard" as const, label: ta("tab-standard") },
                { key: "fixed" as const, label: ta("tab-fixed") },
                { key: "template-ai" as const, label: ta("tab-template-ai") },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`px-2 py-2 text-xs transition-colors sm:text-sm ${
                  activeMappingTab === tab.key
                    ? "bg-background font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setActiveMappingTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-3">
            {activeMappingTab === "standard" ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">{ta("map-to-standard")}</label>
                <StandardFieldPicker fields={standardFields} value={stdId} onChange={setStdId} />
                {selectedStandard && selectedStandard.data_type !== field.field_type ? (
                  <div className="rounded border border-tone-warning bg-tone-warning/15 px-2 py-1 text-xs text-foreground">
                    {ta("type-mismatch", {
                      standardType: selectedStandard.data_type,
                      fieldType: field.field_type,
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeMappingTab === "fixed" ? (
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground">{ta("tab-fixed")}</label>
                <Input
                  value={fixedValue}
                  onChange={(e) => setFixedValue(e.target.value)}
                  placeholder={ta("fixed-placeholder")}
                />
              </div>
            ) : null}

            {activeMappingTab === "template-ai" ? (
              <div className="grid grid-cols-1 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{ta("field-property")}</label>
                  <Input
                    value={templateFieldCode}
                    onChange={(e) => setTemplateFieldCode(e.target.value)}
                    placeholder={ta("field-property-placeholder")}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{ta("ai-hint")}</label>
                  <textarea
                    value={templateAiHint}
                    onChange={(e) => setTemplateAiHint(e.target.value)}
                    placeholder={ta("ai-hint-placeholder")}
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {field.field_type === "checkbox" || field.field_type === "radio" ? (
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">{ta("checkbox-value")}</label>
          <Input value={checkboxValue} onChange={(e) => setCheckboxValue(e.target.value)} />
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          className="flex items-center justify-between text-sm"
          onClick={() => setCoordsOpen((o) => !o)}
        >
          <span className="text-xs font-medium text-muted-foreground">{ta("coordinates")}</span>
          <span className="text-xs text-muted-foreground">
            {coordsOpen ? ta("collapse") : ta("expand")}
          </span>
        </button>
        {coordsOpen ? (
          <div className="grid grid-cols-2 gap-2">
            {(["pos_x", "pos_y", "width", "height"] as const).map((key) => (
              <div key={key} className="flex flex-col gap-0.5">
                <span className="text-[10px] text-muted-foreground">
                  {key === "pos_x" ? "x" : key === "pos_y" ? "y" : key === "width" ? "w" : "h"}
                </span>
                <Input
                  type="number"
                  step="0.1"
                  value={coords[key]}
                  onChange={(e) => setCoords({ ...coords, [key]: parseFloat(e.target.value) || 0 })}
                  onBlur={applyCoords}
                />
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          className="text-destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deleteTemplateFieldAction(templateId, field.id);
              if (!result.ok) showToast(result.message, "error");
              else {
                showToast(ta("deleted"));
                onDeleted();
              }
            })
          }
        >
          {ta("delete")}
        </Button>
        <Button type="button" variant="outline" disabled={pending} onClick={() => setIgnoreOpen(true)}>
          {t("ignore")}
        </Button>
        <Button
          type="button"
          className="flex-1"
          disabled={pending || !canConfirmMapping}
          onClick={confirmMapping}
        >
          {ta("confirm-mapping")}
        </Button>
      </div>

      <Dialog open={ignoreOpen} onOpenChange={setIgnoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ta("ignore-title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{ta("ignore-feedforward", { label })}</p>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">{ta("ignore-reason")}</label>
            <textarea
              value={ignoreReason}
              onChange={(e) => setIgnoreReason(e.target.value)}
              placeholder={ta("ignore-placeholder")}
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIgnoreOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await ignoreFieldAction(
                    templateId,
                    field.id,
                    field.row_version,
                    ignoreReason.trim() || undefined,
                  );
                  if (!result.ok) showToast(result.message, "error");
                  else {
                    setIgnoreOpen(false);
                    await onChanged();
                    showToast(ta("ignored"));
                  }
                })
              }
            >
              {t("ignore")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
