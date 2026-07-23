"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@acuity/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ApiError, api, claims } from "@acuity/api-client";
import type { ClaimOut } from "@acuity/types";
import {
  AlertIcon,
  Button,
  Callout,
  CheckCircleIcon,
  CheckIcon,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FileIcon,
  ShieldIcon,
  SparkleIcon,
  cn,
} from "@acuity/ui";
import { formatDateTime } from "@acuity/i18n/format";
import { formatTimeHM } from "@/lib/clock";
import { ResizableSplit } from "@/components/loop/resizable-split";
import type { Locale } from "@/i18n/routing";
import type { FieldStatus } from "@acuity/api-client/mocks/fixtures";
import { useApi } from "@/lib/use-api";
import { useApiErrorMessage, notifySessionExpired } from "@/lib/api-error";
import { useCatalog } from "@/lib/catalog";
import { formatPatientDisplay } from "@/lib/patient-name";
import { useSession } from "@/lib/session";
import { useClaimHandoff } from "@/lib/claim-hints";
import { LoopScaffold } from "@/components/loop/loop-scaffold";
import { ReviewSurfaceSkeleton } from "@/components/ui/loaders";
import { ErrorPanel } from "@/components/ui/states";
import { ClaimNotFound } from "@/components/ui/claim-not-found";
import { InsurerFormFacsimile } from "@/components/form-preview/insurer-form";
import { recallIntakeSource } from "../intake/intake-source";
import { buildReviewModel, type ReviewField } from "./review-model";
import { ReviewFieldRow } from "./review-field-row";

interface IntakePayload {
  intake_text: string | null;
  confirmed: Record<string, boolean>;
  row_version: number;
}

type PreviewTab = "form" | "notes";
type FilterValue = "all" | FieldStatus;

const SAVE_DEBOUNCE_MS = 500;

// Review (keystone, step 4). The Typeform/Google-Form dual-pane per ADR 0034:
// the always-edit, category-grouped, four-status form on the RIGHT; the
// toggling preview pane (insurer-form facsimile <-> your notes with in-text
// source highlight) on the LEFT. Staff hand-off mode banners the staff note;
// sign-off is the one deliberate confirmation with a feedforward preview and a
// producing success-loading state. Field saves debounce ~500ms, roll back on
// failure, and surface the 409 optimistic-lock conflict.

export function Review({ claimId }: { claimId: number }) {
  const t = useTranslations("review");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const searchParams = useSearchParams();
  const manualMode = searchParams.get("mode") === "manual";
  const apiMessage = useApiErrorMessage();
  const catalog = useCatalog();
  const { me } = useSession();
  // Only the attending doctor signs; any other role sees a read-only notice
  // (permission-denied is rendered, never silently hidden).
  const canSign = !me || me.role === "DOCTOR";
  const { handoff, accept: acceptHandoff } = useClaimHandoff(claimId);

  const claimState = useApi<ClaimOut>(() => claims.getClaim(claimId), [claimId]);
  const intakeState = useApi<IntakePayload>(
    () => api.get<IntakePayload>(`/doctor/claims/${claimId}/intake-text`),
    [claimId],
  );

  // Local field state layered over the server claim (optimistic edits).
  const [localValues, setLocalValues] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const serverValuesRef = useRef<Record<string, string>>({});
  const rowVersionRef = useRef<number>(1);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [filter, setFilter] = useState<FilterValue>("all");
  const [previewTab, setPreviewTab] = useState<PreviewTab>("form");
  const [mobileTab, setMobileTab] = useState<"form" | "preview">("form");
  const [highlightSpan, setHighlightSpan] = useState<string | null>(null);
  const [inlineSourceField, setInlineSourceField] = useState<string | null>(null);
  const [linkedScroll, setLinkedScroll] = useState(false);
  const [saveNotice, setSaveNotice] = useState<
    { tone: "danger" | "warning"; message: string } | null
  >(null);
  const [signOffOpen, setSignOffOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [activeRow, setActiveRow] = useState<string | null>(null);
  const [producing, setProducing] = useState(false);
  const [signOffError, setSignOffError] = useState<string | null>(null);
  const [showRequiredErrors, setShowRequiredErrors] = useState(false);
  const autoFocusedRef = useRef(false);

  // Seed local state from the server claim once loaded.
  useEffect(() => {
    if (claimState.data) {
      const values = (claimState.data.final_field_values ?? {}) as Record<string, string>;
      serverValuesRef.current = { ...values };
      setLocalValues(values);
    }
  }, [claimState.data]);
  useEffect(() => {
    if (intakeState.data) {
      setConfirmed(intakeState.data.confirmed ?? {});
      rowVersionRef.current = intakeState.data.row_version;
    }
  }, [intakeState.data]);

  // Merge local edits over the server claim before deriving the model.
  const mergedClaim = useMemo<ClaimOut | undefined>(() => {
    if (!claimState.data) return undefined;
    return {
      ...claimState.data,
      final_field_values: { ...(claimState.data.final_field_values ?? {}), ...localValues },
    };
  }, [claimState.data, localValues]);

  const model = useMemo(
    () => (mergedClaim ? buildReviewModel(mergedClaim, confirmed) : undefined),
    [mergedClaim, confirmed],
  );

  const companyLabel = claimState.data
    ? catalog.companyName(claimState.data.company_id, locale)
    : "";
  const formLabel = claimState.data
    ? catalog.formName(claimState.data.template_id, locale)
    : "";

  // Auto-focus the first Needs-input field on entry (review.md acceptance 1).
  useEffect(() => {
    if (!model || autoFocusedRef.current) return;
    autoFocusedRef.current = true;
    if (model.firstNeedsInput) {
      requestAnimationFrame(() => {
        document.getElementById(`field-${model.firstNeedsInput}`)?.focus();
      });
    }
  }, [model]);

  // --- mutations (optimistic, debounced ~500ms, rollback on failure) --------

  const persist = useCallback(
    async (values: Record<string, string>, confirmMap: Record<string, boolean>) => {
      setSaveNotice(null);
      try {
        await api.put<ClaimOut>(`/doctor/claims/${claimId}/fields`, {
          final_field_values: values,
          confirmed: confirmMap,
          row_version: rowVersionRef.current,
        });
        rowVersionRef.current += 1;
        serverValuesRef.current = { ...values };
        // Quiet autosave visibility: state the time of the last save.
        setSaving(false);
        setLastSavedAt(new Date());
      } catch (cause) {
        notifySessionExpired(cause);
        if (cause instanceof ApiError && cause.kind === "conflict") {
          // Optimistic-lock conflict: reload the latest and surface the notice.
          setSaveNotice({ tone: "warning", message: t("conflict-error") });
          claimState.refetch();
          intakeState.refetch();
        } else {
          // Roll the values back to the last server truth (never a silent
          // keep-the-broken-edit).
          setLocalValues({ ...serverValuesRef.current });
          setSaveNotice({ tone: "danger", message: t("save-error") });
        }
        setSaving(false);
      }
    },
    [claimId, t, claimState, intakeState],
  );

  const scheduleSave = useCallback(
    (values: Record<string, string>, confirmMap: Record<string, boolean>) => {
      setSaving(true);
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        void persist(values, confirmMap);
      }, SAVE_DEBOUNCE_MS);
    },
    [persist],
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const editField = useCallback(
    (code: string, value: string) => {
      setConfirmed((prevConfirmed) => {
        // Editing un-confirms the field (it must be re-confirmed).
        const nextConfirmed = { ...prevConfirmed, [code]: false };
        setLocalValues((prev) => {
          const next = { ...prev, [code]: value };
          scheduleSave(next, nextConfirmed);
          return next;
        });
        return nextConfirmed;
      });
    },
    [scheduleSave],
  );

  const confirmField = useCallback(
    (code: string) => {
      setConfirmed((prev) => {
        const next = { ...prev, [code]: true };
        setLocalValues((values) => {
          scheduleSave(values, next);
          return values;
        });
        return next;
      });
    },
    [scheduleSave],
  );

  // The pre-sign-off un-confirm window: a confirmed value can be reopened any
  // time before sign-off (undo over confirmation; sign-off gating unchanged).
  const unconfirmField = useCallback(
    (code: string) => {
      setConfirmed((prev) => {
        const next = { ...prev, [code]: false };
        setLocalValues((values) => {
          scheduleSave(values, next);
          return values;
        });
        return next;
      });
    },
    [scheduleSave],
  );

  const clearField = useCallback(
    (code: string) => editField(code, ""),
    [editField],
  );

  // --- where-from + linked scrolling ------------------------------------------

  const isDesktop = useMediaQuery("(min-width: 64rem)");

  const whereFrom = useCallback(
    (code: string, span: string | null) => {
      if (isDesktop) {
        setPreviewTab("notes");
        setHighlightSpan(span);
      } else {
        // Narrow: reveal the source inline beneath the field (matrix 4.5.20).
        setInlineSourceField((prev) => (prev === code ? null : code));
      }
    },
    [isDesktop],
  );

  const onFieldFocus = useCallback(
    (code: string) => {
      if (linkedScroll && previewTab === "form") {
        document
          .getElementById(`pv-${code}`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    },
    [linkedScroll, previewTab],
  );

  const focusNextNeedsInput = useCallback(() => {
    if (!model) return;
    const ordered: string[] = [];
    for (const group of model.groups) {
      for (const field of group.fields) {
        if (field.status === "needs-input") ordered.push(field.field_code);
      }
    }
    if (ordered.length === 0) return;
    const active = document.activeElement?.id ?? "";
    const activeCode = active.startsWith("field-") ? active.slice(6) : null;
    const currentIndex = activeCode ? ordered.indexOf(activeCode) : -1;
    const next = ordered[(currentIndex + 1) % ordered.length];
    document.getElementById(`field-${next}`)?.focus();
    document
      .getElementById(`row-${next}`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [model]);

  // --- sign-off -----------------------------------------------------------------

  async function handleSignOff() {
    setProducing(true);
    setSignOffError(null);
    try {
      // Flush any pending debounced save first so the server sees final values.
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        await persist(localValues, confirmed);
      }
      await claims.confirmClaim(claimId);
      await acceptHandoff();
      router.push(`/forms/${claimId}/produce`);
    } catch (cause) {
      notifySessionExpired(cause);
      setProducing(false);
      setShowRequiredErrors(true);
      setSignOffError(
        cause instanceof ApiError && cause.kind === "validation"
          ? t("sign-off-validation")
          : apiMessage(cause instanceof ApiError ? cause : undefined),
      );
    }
  }

  // --- render -----------------------------------------------------------------

  const loading = claimState.loading || intakeState.loading;
  const notFound = claimState.error?.kind === "not_found";

  const filteredGroups = useMemo(() => {
    if (!model) return [];
    if (filter === "all") return model.groups;
    return model.groups
      .map((g) => ({ ...g, fields: g.fields.filter((f) => f.status === filter) }))
      .filter((g) => g.fields.length > 0);
  }, [model, filter]);

  // --- keyboard traversal (the review loop's ergonomic layer) -----------------
  // Single-key traversal over the visible field list: j/k (or arrows) move,
  // n jumps to the next field needing input, Enter edits, Esc returns to the
  // list, c confirms, ? opens the reference sheet. Keys are inert while a
  // field is being edited (except Esc); pointer and Tab parity always remain.

  const fieldOrder = useMemo(
    () => filteredGroups.flatMap((g) => g.fields.map((f) => f.field_code)),
    [filteredGroups],
  );
  const fieldByCode = useMemo(() => {
    const map = new Map<string, ReviewField>();
    for (const group of filteredGroups) {
      for (const field of group.fields) map.set(field.field_code, field);
    }
    return map;
  }, [filteredGroups]);

  useEffect(() => {
    if (fieldOrder.length === 0) return;
    if (!activeRow || !fieldOrder.includes(activeRow)) {
      setActiveRow(fieldOrder[0] ?? null);
    }
  }, [fieldOrder, activeRow]);

  const focusRow = useCallback((code: string) => {
    setActiveRow(code);
    const row = document.getElementById(`row-${code}`);
    row?.focus();
    row?.scrollIntoView({ block: "nearest" });
  }, []);

  const handleListKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.nativeEvent.isComposing) return;
      const target = event.target as HTMLElement;
      const editing = /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName);

      // Esc inside a field returns focus to its row (never loses the value).
      if (editing) {
        if (event.key === "Escape" && target.id.startsWith("field-")) {
          event.preventDefault();
          focusRow(target.id.slice(6));
        }
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      // Traversal keys act only when a row itself holds focus.
      if (!target.id.startsWith("row-")) return;
      const code = target.id.slice(4);
      const index = fieldOrder.indexOf(code);
      if (index < 0) return;

      switch (event.key) {
        case "j":
        case "ArrowDown": {
          event.preventDefault();
          const next = fieldOrder[Math.min(index + 1, fieldOrder.length - 1)];
          if (next) focusRow(next);
          break;
        }
        case "k":
        case "ArrowUp": {
          event.preventDefault();
          const prev = fieldOrder[Math.max(index - 1, 0)];
          if (prev) focusRow(prev);
          break;
        }
        case "n":
          event.preventDefault();
          focusNextNeedsInput();
          break;
        case "Enter":
          event.preventDefault();
          document.getElementById(`field-${code}`)?.focus();
          break;
        case "c": {
          // Explicit confirm only — traversal never auto-confirms, and the
          // key respects the same gating as the row's checkmark.
          event.preventDefault();
          const field = fieldByCode.get(code);
          if (
            field &&
            !field.confirmed &&
            !(field.value === "" && field.required) &&
            !(field.problem !== null && field.problem.blocking)
          ) {
            confirmField(code);
          }
          break;
        }
        default:
          break;
      }
    },
    [fieldOrder, fieldByCode, focusRow, focusNextNeedsInput, confirmField],
  );


  // The un-confirm window closes at sign-off: once the claim leaves the
  // pre-sign-off states, confirmed values can no longer be reopened here.
  const preSignOff =
    claimState.data?.status === "DRAFT" || claimState.data?.status === "AI_FILLED";

  const intakeSource = recallIntakeSource(claimId);
  const intakeSourceLine = manualMode
    ? t("intake-source-manual")
    : claimState.data
      ? intakeSource?.kind === "import" && intakeSource.filename
        ? t("intake-source-import", {
            filename: intakeSource.filename,
            when: formatDateTime(claimState.data.created_at, locale, {
              timeZone: "Asia/Hong_Kong",
            }),
          })
        : t("intake-source-paste", {
            when: formatDateTime(claimState.data.created_at, locale, {
              timeZone: "Asia/Hong_Kong",
            }),
          })
      : "";

  if (notFound) {
    return (
      <LoopScaffold step={2} heading={t("step-heading")} headingHidden confirmLeave={false}>
        <ClaimNotFound />
      </LoopScaffold>
    );
  }

  const autosaveIndicator = (saving || lastSavedAt) && (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      {saving ? (
        t("autosave-saving")
      ) : (
        <>
          <CheckIcon size={13} aria-hidden />
          {t("autosave-saved", { time: formatTimeHM(lastSavedAt as Date, locale) })}
        </>
      )}
    </span>
  );

  const summaryBar = model && (
    <div className="rounded-md border border-border bg-card p-4">
      {model.blockingCount === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
          <p className="inline-flex items-center gap-2 text-base font-medium text-foreground">
            <CheckCircleIcon size={18} className="text-[var(--state-confirmed)]" aria-hidden />
            {t("summary-all-confirmed")}
          </p>
          {autosaveIndicator}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {model.counts.drafted > 0 && (
            <SummaryStat n={model.counts.drafted} state="drafted" word={t("stat-drafted")} />
          )}
          {model.counts.needsInput > 0 && (
            <SummaryStat
              n={model.counts.needsInput}
              state="needs-input"
              word={t("stat-needs-input")}
              onClick={focusNextNeedsInput}
              actionLabel={t("next-needs-input")}
            />
          )}
          {model.counts.confirmed > 0 && (
            <SummaryStat
              n={model.counts.confirmed}
              state="confirmed"
              word={t("stat-confirmed")}
            />
          )}
          <span className="ml-auto inline-flex items-center gap-4">
            {autosaveIndicator}
            {model.counts.needsInput > 0 && (
              <button
                type="button"
                onClick={focusNextNeedsInput}
                className="-my-1 inline-flex items-center py-1 text-sm font-medium text-[var(--link-text)] transition-colors duration-[120ms] hover:text-[var(--link-text-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("next-needs-input")}
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  );

  const filterChips = model && (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t("filter-all")}>
      {(
        [
          ["all", t("filter-all")],
          ["needs-input", t("status-needs-input")],
          ["drafted", t("status-drafted")],
          ["confirmed", t("status-confirmed")],
          ["optional", t("status-optional")],
        ] as [FilterValue, string][]
      ).map(([value, label]) => {
        const active = filter === value;
        const count =
          value === "all"
            ? undefined
            : model.counts[value === "needs-input" ? "needsInput" : value];
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            onClick={() => setFilter(value)}
            className={cn(
              "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors duration-[120ms]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              active
                ? "border-primary bg-muted text-primary"
                : "border-border bg-card text-foreground hover:bg-accent",
            )}
          >
            {label}
            {count !== undefined && <span className="text-muted-foreground">{count}</span>}
          </button>
        );
      })}
      <button
        type="button"
        onClick={() => setShortcutsOpen(true)}
        className="-my-1 ml-auto hidden items-center gap-1.5 self-center py-1 text-xs font-medium text-muted-foreground transition-colors duration-[120ms] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex"
      >
        {t("shortcuts-title")}
        <Kbd>?</Kbd>
      </button>
    </div>
  );

  const banners = (
    <>
      {manualMode && (
        <Callout tone="warning" icon={<SparkleIcon size={20} />}>
          {t("manual-mode-notice")}
        </Callout>
      )}
      {handoff && (
        <Callout tone="info" icon={<AlertIcon size={20} />}>
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-foreground">{t("handoff-banner-title")}</p>
            <p className="text-sm text-muted-foreground">
              {t("handoff-banner-note", {
                staff: handoff.prepared_by,
                note: locale === "zh-Hant-HK" ? handoff.note_zh : handoff.note_en,
              })}
            </p>
          </div>
        </Callout>
      )}
      {saveNotice && <Callout tone={saveNotice.tone}>{saveNotice.message}</Callout>}
    </>
  );

  // The right-pane field list (desktop) / Form tab body (mobile).
  const fieldList = (
    // Keyboard-shortcut delegation for the rows inside (roving tabindex per the
    // WAI-ARIA APG grid pattern); the wrapper itself is never a tab stop and all
    // children are native controls.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div onKeyDown={handleListKeyDown}>
      <p className="flex items-center gap-1.5 px-0.5 pb-3.5 pt-0.5 text-sm text-muted-foreground">
        <FileIcon size={14} aria-hidden />
        {intakeSourceLine}
      </p>
      <div className="space-y-8">
        {filteredGroups.map((group) => (
          <section key={group.category.code}>
            <h2 className="mb-3 font-title text-xl font-semibold text-foreground">
              {locale === "zh-Hant-HK" ? group.category.label_zh : group.category.label_en}
            </h2>
            <div className="space-y-3">
              {group.fields.map((field) => (
                <ReviewFieldRow
                  key={field.field_code}
                  field={field}
                  locale={locale}
                  showRequiredError={showRequiredErrors}
                  inlineSource={inlineSourceField === field.field_code}
                  rowTabIndex={activeRow === field.field_code ? 0 : -1}
                  unconfirmable={preSignOff}
                  onEdit={(value) => editField(field.field_code, value)}
                  onConfirm={() => confirmField(field.field_code)}
                  onUnconfirm={() => unconfirmField(field.field_code)}
                  onClear={() => clearField(field.field_code)}
                  onWhereFrom={() => whereFrom(field.field_code, field.source_span ?? null)}
                  onFocus={() => onFieldFocus(field.field_code)}
                  onRowFocus={() => setActiveRow(field.field_code)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );

  // The left preview pane (insurer-form facsimile <-> your notes toggle).
  const previewPane = mergedClaim && (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-border bg-muted">
      <div className="flex items-center justify-between gap-2 border-b border-border p-3">
        <div
          role="radiogroup"
          aria-label={t("preview-toggle-form")}
          className="inline-flex rounded-md border border-border bg-card p-0.5"
        >
          {(["form", "notes"] as PreviewTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              role="radio"
              aria-checked={previewTab === tab}
              onClick={() => {
                setPreviewTab(tab);
                if (tab === "form") setHighlightSpan(null);
              }}
              className={cn(
                "rounded-sm px-3 py-1.5 text-sm font-medium transition-colors duration-[120ms]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                previewTab === tab
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-card",
              )}
            >
              {tab === "form" ? t("preview-toggle-form") : t("preview-toggle-notes")}
            </button>
          ))}
        </div>
        {previewTab === "form" && (
          <label className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
            <input
              type="checkbox"
              checked={linkedScroll}
              onChange={(e) => setLinkedScroll(e.target.checked)}
              className="size-4 accent-[var(--color-navy)]"
            />
            {t("linked-scroll")}
          </label>
        )}
      </div>
      {/* The facsimile holds no focusable content, so the scroll pane itself
          is the keyboard stop (scrollable-region-focusable). */}
      <div
        role="region"
        aria-label={t("preview-toggle-form")}
        tabIndex={0}
        className="slim-scroll min-h-0 flex-1 overflow-y-auto p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {previewTab === "form" ? (
          <InsurerFormFacsimile
            claim={mergedClaim}
            values={(mergedClaim.final_field_values ?? {}) as Record<string, string>}
            signed={false}
            fieldAnchorPrefix="pv"
          />
        ) : (
          <NotesPane
            text={intakeState.data?.intake_text ?? null}
            highlight={highlightSpan}
            emptyLabel={t("notes-empty")}
            foundLabel={t("where-from-heading")}
            originalLabel={t("notes-original")}
          />
        )}
      </div>
    </div>
  );

  const footerStatus = model && (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {model.blockingCount > 0 ? (
        <>
          <AlertIcon
            size={16}
            className="shrink-0 text-[var(--state-needs-input)]"
            aria-hidden
          />
          <span className="text-muted-foreground">
            {t("sign-off-disabled-reason", { count: model.blockingCount })}
          </span>
        </>
      ) : (
        <>
          <CheckCircleIcon
            size={16}
            className="shrink-0 text-[var(--state-confirmed)]"
            aria-hidden
          />
          <span className="text-foreground">{t("summary-all-confirmed")}</span>
        </>
      )}
    </span>
  );

  return (
    <LoopScaffold
      step={2}
      heading={t("step-heading")}
      headingHidden
      wide
      footerStart={footerStatus}
      footerEnd={
        canSign ? (
          <Button
            size="lg"
            disabled={!model || model.blockingCount > 0 || loading}
            onClick={() => setSignOffOpen(true)}
          >
            <ShieldIcon size={18} aria-hidden />
            {t("sign-off")}
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">{t("read-only-role")}</span>
        )
      }
    >
      {loading ? (
        <ReviewSurfaceSkeleton label={t("loading-form")} />
      ) : claimState.error ? (
        <ErrorPanel
          title={t("error-title")}
          description={apiMessage(claimState.error)}
          action={
            <Button variant="outline" size="sm" onClick={claimState.refetch}>
              {t("retry")}
            </Button>
          }
        />
      ) : (
        <>
          {/* Exactly one width tree renders (duplicate field ids otherwise). */}
          {isDesktop ? (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="space-y-3">{banners}</div>
            <div className="min-h-0 flex-1">
              <ResizableSplit
                ariaLabel={t("step-heading")}
                defaultLeftPct={42}
                minPct={28}
                maxPct={60}
                left={previewPane}
                right={
                  <div className="flex h-full min-h-0 flex-col gap-3">
                    {summaryBar}
                    {filterChips}
                    <div className="slim-scroll min-h-0 flex-1 overflow-y-auto pb-4 pr-1">
                      {fieldList}
                    </div>
                  </div>
                }
              />
            </div>
          </div>

          ) : (
          <div className="flex flex-col gap-3">
            {banners}
            {summaryBar}
            {filterChips}
            <div
              role="radiogroup"
              aria-label={t("step-heading")}
              className="inline-flex self-start rounded-md border border-border bg-card p-0.5"
            >
              {(["form", "preview"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="radio"
                  aria-checked={mobileTab === tab}
                  onClick={() => setMobileTab(tab)}
                  className={cn(
                    "min-h-11 rounded-sm px-4 text-sm font-medium transition-colors duration-[120ms]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    mobileTab === tab
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-accent",
                  )}
                >
                  {tab === "form" ? t("mobile-tab-form") : t("mobile-tab-preview")}
                </button>
              ))}
            </div>
            {mobileTab === "form" ? (
              <div className="pb-4">{fieldList}</div>
            ) : (
              <div className="min-h-96">{previewPane}</div>
            )}
          </div>
          )}
        </>
      )}

      {/* Sign-off feedforward preview (the one deliberate confirmation). */}
      <Dialog
        open={signOffOpen}
        onOpenChange={(open) => {
          if (!producing) setSignOffOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <p className="t-eyebrow text-muted-foreground">{t("sign-off-eyebrow")}</p>
            <DialogTitle>{t("sign-off-preview-title", { company: companyLabel })}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("sign-off-preview-body")}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-border bg-muted p-4">
            <PvLine k={t("sign-off-row-form")} val={formLabel} />
            <PvLine
              k={t("sign-off-row-patient")}
              val={formatPatientDisplay(claimState.data ?? {}) || "—"}
            />
            <PvLine k={t("sign-off-row-insurer")} val={companyLabel} />
            <PvLine
              k={t("sign-off-row-delivery")}
              val={t("sign-off-row-delivery-value", { company: companyLabel })}
              last
            />
          </div>
          <p className="text-sm text-muted-foreground">{t("sign-off-preview-body")}</p>
          {signOffError && <Callout tone="danger">{signOffError}</Callout>}
          <DialogFooter>
            {!producing && (
              <Button variant="ghost" onClick={() => setSignOffOpen(false)}>
                {t("sign-off-cancel")}
              </Button>
            )}
            <Button
              variant={producing ? "success" : "default"}
              loading={producing}
              disabled={producing}
              onClick={handleSignOff}
            >
              {producing ? t("sign-off-producing") : t("sign-off-confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* The keyboard reference sheet (opened with ? or the list affordance). */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("shortcuts-title")}</DialogTitle>
            <DialogDescription>{t("shortcuts-intro")}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2.5">
            <ShortcutLine keys={["j", "k"]} label={t("shortcut-move")} />
            <ShortcutLine keys={["n"]} label={t("shortcut-next-attention")} />
            <ShortcutLine keys={["Enter"]} label={t("shortcut-edit")} />
            <ShortcutLine keys={["Esc"]} label={t("shortcut-return")} />
            <ShortcutLine keys={["c"]} label={t("shortcut-confirm")} />
            <ShortcutLine keys={["?"]} label={t("shortcut-sheet")} />
          </ul>
        </DialogContent>
      </Dialog>
    </LoopScaffold>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded-sm border border-border bg-muted px-1 py-0.5 font-mono text-xs leading-none text-foreground">
      {children}
    </kbd>
  );
}

function ShortcutLine({ keys, label }: { keys: string[]; label: string }) {
  return (
    <li className="flex items-center justify-between gap-4 text-sm text-foreground">
      <span>{label}</span>
      <span className="inline-flex shrink-0 items-center gap-1">
        {keys.map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      </span>
    </li>
  );
}

function SummaryStat({
  n,
  state,
  word,
  onClick,
  actionLabel,
}: {
  n: number;
  state: "drafted" | "needs-input" | "confirmed";
  word: string;
  /** Makes the stat navigational (jump to the next unresolved field). */
  onClick?: () => void;
  /** Screen-reader label for the navigational action. */
  actionLabel?: string;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className="size-2 rounded-full"
        style={{ background: `var(--state-${state})` }}
      />
      <span>
        <strong className="font-semibold">{n}</strong> {word}
      </span>
    </>
  );
  if (onClick) {
    // The aggregate segment is itself the jump-to-next control — glance and
    // action are one element. Colour-channel feedback only (no geometry).
    return (
      <button
        type="button"
        onClick={onClick}
        title={actionLabel}
        aria-label={actionLabel ? `${n} ${word} — ${actionLabel}` : undefined}
        className="inline-flex items-center gap-2 rounded-sm text-base text-foreground underline decoration-[var(--color-border-strong)] underline-offset-4 transition-colors duration-[120ms] hover:decoration-[var(--link-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        {body}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2 text-base text-foreground">{body}</span>
  );
}

function PvLine({ k, val, last }: { k: string; val: string; last?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1.5",
        !last && "border-b border-border",
      )}
    >
      <span className="text-sm text-muted-foreground">{k}</span>
      <span className="text-right text-sm font-medium text-foreground">{val}</span>
    </div>
  );
}

// The your-notes pane: the doctor's original uploaded record with the
// where-from source span highlighted IN the text (amber wash + warning edge),
// never a detached quote card.
function NotesPane({
  text,
  highlight,
  emptyLabel,
  foundLabel,
  originalLabel,
}: {
  text: string | null;
  highlight: string | null;
  emptyLabel: string;
  foundLabel: string;
  originalLabel: string;
}) {
  const markRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (highlight && markRef.current) {
      markRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [highlight]);

  if (!text) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;

  let before = text;
  let match = "";
  let after = "";
  if (highlight) {
    const index = text.indexOf(highlight);
    if (index >= 0) {
      before = text.slice(0, index);
      match = highlight;
      after = text.slice(index + highlight.length);
    }
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <FileIcon size={14} aria-hidden />
        {highlight && match ? foundLabel : originalLabel}
      </p>
      <pre className="whitespace-pre-wrap rounded-md border border-border bg-background p-4 font-mono text-xs leading-relaxed text-foreground">
        {match ? (
          <>
            {before}
            <mark
              ref={markRef}
              className="rounded-sm px-1 py-0.5"
              style={{
                background:
                  "color-mix(in srgb, var(--tone-warning) 45%, transparent)",
                boxShadow: "inset 2px 0 0 var(--tone-warning-glyph)",
                color: "inherit",
              }}
            >
              {match}
            </mark>
            {after}
          </>
        ) : (
          text
        )}
      </pre>
    </div>
  );
}

// A tiny media-query hook (the review adapts where-from behaviour by width).
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
