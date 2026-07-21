"use client";

// The confirmation field-map editor (keystone surface): split pane — the
// original insurer PDF with detected-field overlays (colour + icon per state,
// selected = 2px primary) on the left, the field map on the right with
// Attention / Form-structure views, expandable editable rows (label / type /
// binding / validation), pipelines-disagree pick-one conflict resolution,
// mark-resolved, autosave (Draft saved / Saving…), publish gated on zero
// unresolved fields behind the acknowledgement confirm, archive behind the
// paste gate, and 409 row_version conflict surfacing with reload.
//
// Editor ergonomics: zoom presets (fit width / fit page / 100–150%), arrow-key
// nudge + Shift+arrow resize on the selected overlay box (debounced through
// the same optimistic-update + row_version seam as every field edit), and an
// unsaved-changes guard — leaving the page while a save is in flight or a
// nudge is unflushed asks before discarding.

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "@acuity/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmGateDialog,
  Input,
  Loader,
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
  archiveTemplateAction,
  ignoreFieldAction,
  previewFillAction,
  publishTemplateAction,
  refreshTemplateFieldsAction,
  restoreFieldAction,
  saveFieldMappingAction,
  updateTemplateFieldAction,
} from "@/lib/actions";
import { PdfPageCanvas, resolveTemplatePdfUrl } from "@/components/forms/pdf-page-canvas";

type FieldState = "resolved" | "low" | "conflict" | "pending" | "ignored";

// The contract's closed field-type enum, in display order (i18n keys type-*).
const FIELD_TYPES: TemplateFieldType[] = ["text", "date", "checkbox", "radio", "image", "signature"];

const STATE_HUE: Record<FieldState, string> = {
  resolved: "var(--caliber-glaucous)",
  low: "var(--tone-warning-glyph)",
  conflict: "var(--caliber-cranberry)",
  pending: "var(--tone-warning-glyph)",
  ignored: "var(--caliber-steel-grey)",
};

const STATE_ICON: Record<FieldState, "dot" | "alert" | "alert-triangle" | "dash"> = {
  resolved: "dot",
  low: "alert",
  conflict: "alert-triangle",
  pending: "alert",
  ignored: "dash",
};

interface TemplateInfo {
  id: number;
  code: string;
  name: string;
  version: string;
  page_count: number;
  page_width: number;
  page_height: number;
  insurer: string;
  type_label: string;
  /** Same-origin /local-storage/... URL for the uploaded PDF. */
  pdf_url: string;
}

export function FieldMapEditor({
  template,
  initialFields,
  standardFields,
  conflicts,
  usageCount,
  reversion,
}: {
  template: TemplateInfo;
  initialFields: TemplateFieldOut[];
  standardFields: { id: number; label: string; code: string }[];
  conflicts: Record<number, TemplateFieldType[]>;
  usageCount: number;
  reversion: boolean;
}) {
  const t = useTranslations("editor");
  const router = useRouter();
  const { showToast } = useToast();
  const [fields, setFields] = useState<TemplateFieldOut[]>(initialFields);
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<"attention" | "structure">("attention");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<number | "fit-width" | "fit-page">(1);
  const [paneSize, setPaneSize] = useState<{ w: number; h: number } | null>(null);
  const [savingCount, setSavingCount] = useState(0);
  const [staleConflict, setStaleConflict] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [publishing, startPublish] = useTransition();
  const rowRefs = useRef(new Map<number, HTMLDivElement>());
  const editorRef = useRef<HTMLDivElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef<TemplateFieldOut[]>(initialFields);
  const selectedRef = useRef<number | null>(null);
  const pendingGeometry = useRef(new Set<number>());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  fieldsRef.current = fields;
  selectedRef.current = selected;

  const stateOf = (f: TemplateFieldOut): FieldState => {
    if (f.field_status === "IGNORED") return "ignored";
    if (conflicts[f.id] && !f.is_confirmed && f.field_status !== "MAPPED") return "conflict";
    if (f.field_status === "MAPPED" || f.is_confirmed) return "resolved";
    if ((f.confidence_score ?? 1) < 0.75) return "low";
    return "pending";
  };

  const unresolved = fields.filter((f) => {
    const s = stateOf(f);
    return s === "low" || s === "conflict" || s === "pending";
  });
  const canPublish = unresolved.length === 0 && fields.length > 0;

  const groups = useMemo(() => {
    if (view === "attention") {
      return [
        { label: t("group-needs-review", { count: unresolved.length }), items: unresolved },
        {
          label: t("group-resolved", { count: fields.filter((f) => stateOf(f) === "resolved").length }),
          items: fields.filter((f) => stateOf(f) === "resolved"),
        },
        {
          label: t("group-ignored", { count: fields.filter((f) => stateOf(f) === "ignored").length }),
          items: fields.filter((f) => stateOf(f) === "ignored"),
        },
      ];
    }
    return Array.from({ length: template.page_count }, (_, i) => ({
      label: t("group-page", { page: i + 1 }),
      items: fields.filter((f) => f.page_no === i + 1),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from fields/view
  }, [fields, view, unresolved.length, t, template.page_count]);

  async function reloadFields() {
    const result = await refreshTemplateFieldsAction(template.id);
    if (result.ok && result.data) {
      setFields(result.data);
      setStaleConflict(false);
    }
  }

  function applyResult(fieldId: number, result: Awaited<ReturnType<typeof updateTemplateFieldAction>>) {
    if (result.ok && result.data) {
      const next = result.data;
      setFields((fs) => fs.map((f) => (f.id === fieldId ? next : f)));
    } else if (!result.ok && result.kind === "conflict") {
      setStaleConflict(true);
    } else if (!result.ok) {
      showToast(result.message, "error");
    }
  }

  function update(field: TemplateFieldOut, patch: Partial<Pick<TemplateFieldOut, "field_label_raw" | "field_type" | "font_size">>) {
    setSavingCount((n) => n + 1);
    // Optimistic apply; the server response (or 409) reconciles.
    setFields((fs) => fs.map((f) => (f.id === field.id ? { ...f, ...patch } : f)));
    void updateTemplateFieldAction(template.id, field.id, { row_version: field.row_version, ...patch })
      .then((result) => applyResult(field.id, result))
      .finally(() => setSavingCount((n) => n - 1));
  }

  function bindAndResolve(field: TemplateFieldOut, standardFieldId: number | null) {
    setSavingCount((n) => n + 1);
    void saveFieldMappingAction(template.id, field.id, {
      standard_field_id: standardFieldId,
      confirm: true,
    })
      .then(async (result) => {
        if (result.ok) await reloadFields();
        else if (result.kind === "conflict") setStaleConflict(true);
        else showToast(result.message, "error");
      })
      .finally(() => setSavingCount((n) => n - 1));
  }

  function resolveConflict(field: TemplateFieldOut, pickedType: TemplateFieldType) {
    setSavingCount((n) => n + 1);
    void updateTemplateFieldAction(template.id, field.id, {
      row_version: field.row_version,
      field_type: pickedType,
      is_confirmed: true,
    })
      .then((result) => applyResult(field.id, result))
      .finally(() => setSavingCount((n) => n - 1));
  }

  function ignore(field: TemplateFieldOut) {
    setSavingCount((n) => n + 1);
    void ignoreFieldAction(template.id, field.id, field.row_version)
      .then((result) => {
        if (result.ok) void reloadFields();
        else if (result.kind === "conflict") setStaleConflict(true);
        else showToast(result.message, "error");
      })
      .finally(() => setSavingCount((n) => n - 1));
  }

  function restore(field: TemplateFieldOut) {
    setSavingCount((n) => n + 1);
    void restoreFieldAction(template.id, field.id, field.row_version)
      .then((result) => {
        if (result.ok) void reloadFields();
        else if (result.kind === "conflict") setStaleConflict(true);
        else showToast(result.message, "error");
      })
      .finally(() => setSavingCount((n) => n - 1));
  }

  function publish() {
    startPublish(async () => {
      const result = await publishTemplateAction(template.id);
      if (result.ok) {
        showToast(t("published", { name: template.name }));
        router.push("/forms?tab=library");
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  // --- zoom presets: measure the scrollable pane for the fit modes ----------
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const measure = () => setPaneSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // --- keyboard nudge/resize on the selected overlay (debounced save) --------
  function flushGeometry() {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      flushTimer.current = null;
    }
    const ids = [...pendingGeometry.current];
    pendingGeometry.current.clear();
    for (const id of ids) {
      const field = fieldsRef.current.find((f) => f.id === id);
      if (!field) continue;
      setSavingCount((n) => n + 1);
      void updateTemplateFieldAction(template.id, field.id, {
        row_version: field.row_version,
        pos_x: field.pos_x,
        pos_y: field.pos_y,
        width: field.width,
        height: field.height,
      })
        .then((result) => applyResult(field.id, result))
        .finally(() => setSavingCount((n) => n - 1));
    }
  }

  function nudgeSelected(dx: number, dy: number, resize: boolean) {
    const id = selectedRef.current;
    if (id == null) return;
    const field = fieldsRef.current.find((f) => f.id === id);
    if (!field) return;
    const stepX = Math.max(1, template.page_width * 0.005) * dx;
    const stepY = Math.max(1, template.page_height * 0.005) * dy;
    const minSize = Math.max(2, template.page_width * 0.01);
    const patch = resize
      ? {
          width: Math.max(minSize, field.width + stepX),
          height: Math.max(minSize, field.height + stepY),
        }
      : {
          pos_x: Math.min(Math.max(0, field.pos_x + stepX), template.page_width - field.width),
          pos_y: Math.min(Math.max(0, field.pos_y + stepY), template.page_height - field.height),
        };
    // Optimistic apply; the debounced flush persists through the row_version
    // seam (a burst of keystrokes lands as one save).
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    pendingGeometry.current.add(id);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flushGeometry, 500);
  }

  useEffect(() => {
    const root = editorRef.current;
    if (!root) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      // The nudge acts only on the visibly selected overlay box (never while
      // typing in a field row's inputs).
      if (!target.closest("[data-overlay-field]")) return;
      const delta: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const move = delta[event.key];
      if (!move) return;
      nudgeSelected(move[0], move[1], event.shiftKey);
      event.preventDefault();
    }
    root.addEventListener("keydown", onKeyDown);
    return () => root.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handler reads refs
  }, []);

  // --- unsaved-changes guard: in-flight saves and unflushed nudges ------------
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (savingCount > 0 || pendingGeometry.current.size > 0) {
        event.preventDefault();
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [savingCount]);

  // Flush any pending geometry when the editor unmounts (client-side nav).
  useEffect(() => {
    const pending = pendingGeometry;
    return () => {
      if (pending.current.size > 0) flushGeometry();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount flush reads refs
  }, []);

  function selectField(id: number) {
    setSelected((current) => (current === id ? null : id));
    const field = fields.find((f) => f.id === id);
    if (field && field.page_no !== page) setPage(field.page_no);
    rowRefs.current.get(id)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  const nextVersion = `V${(Number.parseInt(template.version.replace(/\D/g, ""), 10) || 1) + 1}`;
  const pageFields = fields.filter((f) => f.page_no === page);

  // Rendered page width per zoom preset: the fit modes derive from the
  // measured pane (p-6 padding on both sides), numeric zoom from the base.
  const PANE_PADDING = 48;
  const pageWidthPx =
    zoom === "fit-width"
      ? Math.max(240, (paneSize?.w ?? 568) - PANE_PADDING)
      : zoom === "fit-page"
        ? Math.max(
            240,
            ((paneSize?.h ?? 640) - PANE_PADDING) * (template.page_width / template.page_height),
          )
        : 520 * zoom;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {staleConflict ? (
        <div
          role="alert"
          data-testid="conflict-banner"
          className="flex items-center gap-2.5 border-b border-border bg-tone-danger/15 px-6 py-2.5 text-sm text-foreground"
        >
          <span className="flex text-destructive">
            <AcuityIcon name="alert-triangle" size={16} />
          </span>
          {t("conflict-banner")}
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={() => void reloadFields()}>
            <AcuityIcon name="retry" size={14} />
            {t("conflict-reload")}
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* PDF pane */}
        <div className="flex min-w-0 flex-col border-r border-border" style={{ width: "56%" }}>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-2">
            <span className="flex text-muted-foreground">
              <AcuityIcon name="file" size={16} />
            </span>
            <span className="text-xs text-muted-foreground">
              {selected != null ? t("nudge-hint") : t("pdf-caption")}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <label className="sr-only" htmlFor="editor-zoom">
                {t("zoom")}
              </label>
              <select
                id="editor-zoom"
                value={typeof zoom === "number" ? String(zoom) : zoom}
                onChange={(e) => {
                  const value = e.target.value;
                  setZoom(value === "fit-width" || value === "fit-page" ? value : Number(value));
                }}
                className="h-7 rounded-md border border-border bg-background px-1.5 text-xs text-foreground"
              >
                <option value="fit-width">{t("zoom-fit-width")}</option>
                <option value="fit-page">{t("zoom-fit-page")}</option>
                <option value="1">100%</option>
                <option value="1.25">125%</option>
                <option value="1.5">150%</option>
              </select>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <button
                  type="button"
                  aria-label={t("prev-page")}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent disabled:opacity-40"
                >
                  <AcuityIcon name="chevron-up" size={14} />
                </button>
                {t("page-of", { page, total: template.page_count })}
                <button
                  type="button"
                  aria-label={t("next-page")}
                  disabled={page >= template.page_count}
                  onClick={() => setPage((p) => Math.min(template.page_count, p + 1))}
                  className="inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-accent disabled:opacity-40"
                >
                  <AcuityIcon name="chevron-down" size={14} />
                </button>
              </span>
            </div>
          </div>
          <div ref={paneRef} className="slim-scroll min-h-0 flex-1 overflow-auto bg-muted p-6">
            <div
              className="relative mx-auto overflow-hidden rounded-sm border border-border bg-background shadow-sm"
              style={{
                width: pageWidthPx,
                maxWidth: zoom === "fit-page" ? undefined : "100%",
                aspectRatio: `${template.page_width} / ${template.page_height}`,
              }}
            >
              {template.pdf_url ? (
                <PdfPageCanvas
                  pdfUrl={resolveTemplatePdfUrl(template.pdf_url)}
                  pageNo={page}
                  widthPx={pageWidthPx}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                  {t("pdf-missing")}
                </div>
              )}
              {pageFields.map((f) => {
                const s = stateOf(f);
                const isSelected = selected === f.id;
                const hue = isSelected ? "var(--caliber-navy)" : STATE_HUE[s];
                return (
                  <button
                    key={f.id}
                    type="button"
                    data-testid={`overlay-${f.id}`}
                    data-overlay-field=""
                    onClick={() => selectField(f.id)}
                    aria-pressed={isSelected}
                    aria-label={f.field_label_raw ?? String(f.id)}
                    className="absolute z-10 flex items-center gap-1 overflow-hidden rounded-sm px-1 text-left"
                    style={{
                      top: `${(f.pos_y / template.page_height) * 100}%`,
                      left: `${(f.pos_x / template.page_width) * 100}%`,
                      width: `${(f.width / template.page_width) * 100}%`,
                      height: `${Math.max((f.height / template.page_height) * 100, 3.5)}%`,
                      border: `${isSelected ? 2 : 1.5}px solid ${hue}`,
                      background: `color-mix(in srgb, ${hue} ${isSelected ? 16 : 8}%, transparent)`,
                    }}
                  >
                    <span className="flex shrink-0" style={{ color: hue }}>
                      <AcuityIcon name={STATE_ICON[s]} size={11} strokeWidth={2} />
                    </span>
                    <span className="truncate text-foreground" style={{ fontSize: 9 }}>{f.field_label_raw}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* field-map pane */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-1 border-b border-border px-4 py-2">
            {(["attention", "structure"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`relative flex h-8 items-center rounded-t-sm px-3 text-sm transition-colors ${
                  view === v
                    ? "text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {t(`view-${v}`)}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">{t("field-count", { count: fields.length })}</span>
          </div>
          <div className="slim-scroll min-h-0 flex-1 overflow-y-auto p-4">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("no-fields")}</p>
            ) : (
              groups.map((group, gi) => (
                <div key={gi} className="mb-4">
                  <div className="mb-2 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
                    {group.label}
                  </div>
                  {group.items.length === 0 ? (
                    <p className="py-1 text-xs text-muted-foreground">{t("group-none")}</p>
                  ) : (
                    group.items.map((f) => (
                      <FieldRow
                        key={f.id}
                        field={f}
                        state={stateOf(f)}
                        selected={selected === f.id}
                        conflictOptions={conflicts[f.id]}
                        standardFields={standardFields}
                        onSelect={() => selectField(f.id)}
                        onUpdate={(patch) => update(f, patch)}
                        onBind={(sfId) => bindAndResolve(f, sfId)}
                        onResolveConflict={(picked) => resolveConflict(f, picked)}
                        onIgnore={() => ignore(f)}
                        onRestore={() => restore(f)}
                        refCallback={(el) => {
                          if (el) rowRefs.current.set(f.id, el);
                          else rowRefs.current.delete(f.id);
                        }}
                      />
                    ))
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* action footer — wraps at phone widths so the autosave state and the
          action cluster never force horizontal overflow */}
      <div className="flex shrink-0 items-center gap-4 border-t border-border px-6 py-3 max-md:flex-wrap">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="autosave-state">
          {savingCount > 0 ? (
            <>
              <Loader size="sm" aria-hidden />
              {t("saving")}
            </>
          ) : (
            <>
              <span className="flex text-success">
                <AcuityIcon name="check" size={14} />
              </span>
              {t("draft-saved")}
            </>
          )}
        </span>
        {!canPublish && fields.length > 0 ? (
          <span className="text-xs text-destructive" data-testid="publish-block">
            {t("publish-blocked", {
              fields: unresolved
                .slice(0, 3)
                .map((f) => f.field_label_raw ?? f.id)
                .join(", "),
              count: unresolved.length,
            })}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2.5">
          {reversion ? (
            <Button
              type="button"
              variant="ghost"
              className="text-destructive"
              onClick={() => setArchiveOpen(true)}
            >
              <AcuityIcon name="layers" size={16} />
              {t("archive")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void previewFillAction(template.id).then((result) => {
                if (result.ok) showToast(t("preview-ready"));
                else showToast(result.message, "error");
              });
            }}
          >
            <AcuityIcon name="eye" size={16} />
            {t("preview-fill")}
          </Button>
          <Button type="button" variant="outline" onClick={() => showToast(t("draft-saved-toast"))}>
            {t("save-draft")}
          </Button>
          <Button
            type="button"
            disabled={!canPublish || publishing}
            onClick={() => setPublishOpen(true)}
            data-testid="publish-button"
          >
            {publishing ? <Loader size="sm" aria-hidden /> : null}
            {t("confirm-publish")}
          </Button>
        </div>
      </div>

      <ConfirmGateDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={t("publish-title")}
        description={
          reversion
            ? t("publish-feedforward-reversion", { name: template.name, version: nextVersion })
            : t("publish-feedforward", { name: template.name })
        }
        variant="ack"
        icon={<AcuityIcon name="shield" size={20} />}
        strings={{
          confirmLabel: t("publish-confirm"),
          cancelLabel: t("cancel"),
          ackLabel: t("publish-ack"),
        }}
        onConfirm={publish}
      />
      <ConfirmGateDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title={t("archive-title")}
        description={t("archive-feedforward", { name: template.name, usage: usageCount })}
        variant="paste"
        target={template.code}
        destructive
        icon={<AcuityIcon name="alert" size={20} />}
        strings={{
          confirmLabel: t("archive-confirm"),
          cancelLabel: t("cancel"),
          pasteInstruction: t("paste-instruction"),
          pastePlaceholder: t("paste-placeholder"),
        }}
        onConfirm={() => {
          void archiveTemplateAction(template.id, template.code).then((result) => {
            if (result.ok) {
              showToast(t("archived", { name: template.name }));
              router.push("/forms?tab=library");
              router.refresh();
            } else {
              showToast(result.message, "error");
            }
          });
        }}
      />
    </div>
  );
}

function FieldRow({
  field,
  state,
  selected,
  conflictOptions,
  standardFields,
  onSelect,
  onUpdate,
  onBind,
  onResolveConflict,
  onIgnore,
  onRestore,
  refCallback,
}: {
  field: TemplateFieldOut;
  state: FieldState;
  selected: boolean;
  conflictOptions?: TemplateFieldType[];
  standardFields: { id: number; label: string; code: string }[];
  onSelect: () => void;
  onUpdate: (patch: Partial<Pick<TemplateFieldOut, "field_label_raw" | "field_type" | "font_size">>) => void;
  onBind: (standardFieldId: number | null) => void;
  onResolveConflict: (picked: TemplateFieldType) => void;
  onIgnore: () => void;
  onRestore: () => void;
  refCallback: (el: HTMLDivElement | null) => void;
}) {
  const t = useTranslations("editor");
  const [label, setLabel] = useState(field.field_label_raw ?? "");
  const [fieldType, setFieldType] = useState(field.field_type);
  const [binding, setBinding] = useState(field.mapping?.standard_field_id ? String(field.mapping.standard_field_id) : "unbound");

  return (
    <div
      ref={refCallback}
      data-testid={`field-row-${field.id}`}
      className={`mb-2 overflow-hidden rounded-lg border bg-card ${selected ? "border-primary" : "border-border"}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-expanded={selected}
        className="flex min-h-11 w-full items-center gap-2.5 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs" style={{ color: STATE_HUE[state] }}>
          <span className="size-2 rounded-full" style={{ background: STATE_HUE[state] }} />
          <AcuityIcon name={STATE_ICON[state]} size={12} strokeWidth={1.75} />
        </span>
        <span className="flex-1 text-sm font-medium text-foreground">{field.field_label_raw}</span>
        <span className="text-xs text-muted-foreground">{t(`state-${state}`)}</span>
        {state !== "conflict" && field.confidence_score != null ? (
          <span className="text-xs tabular-nums text-muted-foreground">
            {Math.round(field.confidence_score * 100)}%
          </span>
        ) : null}
        <span className="flex text-muted-foreground">
          <AcuityIcon name={selected ? "chevron-up" : "chevron-down"} size={16} />
        </span>
      </button>
      {selected ? (
        <div className="border-t border-border px-3 pb-3">
          {state === "conflict" && conflictOptions ? (
            <div className="my-3 rounded-md bg-tone-danger/12 p-3" data-testid={`conflict-${field.id}`}>
              <div className="mb-2 flex items-center gap-1.5 text-xs text-foreground">
                <span className="flex text-destructive">
                  <AcuityIcon name="alert-triangle" size={14} />
                </span>
                {t("conflict-pick", { a: conflictOptions[0] ?? "", b: conflictOptions[1] ?? "" })}
              </div>
              <div className="flex gap-2">
                {conflictOptions.map((option) => (
                  <Button key={option} type="button" variant="outline" size="sm" onClick={() => onResolveConflict(option)}>
                    {option}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("field-label")}</label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => {
                  if (label !== (field.field_label_raw ?? "")) onUpdate({ field_label_raw: label });
                }}
                aria-label={t("field-label")}
                className="h-9"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("field-type")}</label>
              <Select
                value={fieldType}
                onValueChange={(next) => {
                  // Options are rendered from FIELD_TYPES, so the value is a
                  // member of the closed contract enum.
                  const picked = next as TemplateFieldType;
                  setFieldType(picked);
                  onUpdate({ field_type: picked });
                }}
              >
                <SelectTrigger aria-label={t("field-type")} className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {t(`type-${v}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-2.5">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("binding")}</label>
            <Select
              value={binding}
              onValueChange={(next) => {
                setBinding(next);
                onBind(next === "unbound" ? null : Number(next));
              }}
            >
              <SelectTrigger aria-label={t("binding")} className="h-9 w-full" data-testid={`binding-${field.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unbound">{t("unbound")}</SelectItem>
                {standardFields.map((sf) => (
                  <SelectItem key={sf.id} value={String(sf.id)}>
                    {sf.label} · {sf.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="mt-2.5">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("validation")}</label>
            <Input
              value={field.pdf_field_name ?? ""}
              readOnly
              aria-label={t("validation")}
              className="h-9 font-mono text-xs"
              placeholder={t("validation-placeholder")}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            {state === "ignored" ? (
              <Button type="button" variant="outline" size="sm" onClick={onRestore}>
                <AcuityIcon name="retry" size={14} />
                {t("restore")}
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={onIgnore}>
                <AcuityIcon name="dash" size={14} />
                {t("ignore")}
              </Button>
            )}
            {(state === "low" || state === "pending") ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                data-testid={`resolve-${field.id}`}
                onClick={() => onBind(field.mapping?.standard_field_id ?? null)}
              >
                <AcuityIcon name="check" size={14} />
                {t("mark-resolved")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
