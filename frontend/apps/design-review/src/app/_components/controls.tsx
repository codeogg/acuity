"use client";

// Shared editing primitives used across the colour / elevation / font pages:
// the per-item Edit + Reset cluster, labelled fields for the edit panels, and
// the page-level + global toolbars (reset + export as PDF / JSON). Every
// interactive element changes only background / colour on hover (no geometry
// change), per the house rule.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useReview, type Section } from "../review-state";
import { buildExport, downloadJSON, stamp, type ExportScope } from "../_lib/export";

// ── Small indicators ─────────────────────────────────────────────────────────
export function DirtyDot({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <span
      aria-label="edited"
      title="Edited — not yet exported"
      className="inline-block size-2 shrink-0 rounded-full bg-warning"
    />
  );
}

// ── Per-item Edit + Reset cluster ────────────────────────────────────────────
export function RowActions({
  editing,
  onToggleEdit,
  dirty,
  onReset,
}: {
  editing: boolean;
  onToggleEdit: () => void;
  dirty: boolean;
  onReset: () => void;
}) {
  return (
    <div className="no-print flex items-center gap-1.5">
      <DirtyDot on={dirty} />
      <button
        type="button"
        onClick={onToggleEdit}
        aria-pressed={editing}
        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
          editing
            ? "border-navy bg-sky-blue/50 text-navy"
            : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
        }`}
      >
        {editing ? "Done" : "Edit"}
      </button>
      <button
        type="button"
        onClick={onReset}
        disabled={!dirty}
        className="rounded-md border border-border bg-card px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
      >
        Reset
      </button>
    </div>
  );
}

// A real hover tooltip (native `title` is slow/unreliable): the "i" glyph
// reveals a styled popover immediately on hover.
export function InfoTip({ text }: { text: string }) {
  const tipId = useId();
  if (!text) return null;
  return (
    <span className="group/tip relative inline-flex">
      <button
        type="button"
        aria-describedby={tipId}
        className="cursor-help select-none rounded-full border border-border px-1 font-mono text-[9px] leading-none text-muted-foreground focus:outline-none"
      >
        i
      </button>
      <span
        id={tipId}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-40 mb-1.5 w-60 max-w-[16rem] -translate-x-1/2 rounded-md border border-border bg-card px-2.5 py-1.5 text-[11px] font-normal normal-case leading-snug text-foreground opacity-0 shadow-[var(--elevation-raised-emphasis)] transition-opacity duration-100 group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

// ── Labelled field (edit-panel row) ──────────────────────────────────────────
// `desc` (what the parameter controls) + `accepts` (the value types it takes)
// surface on hover of the "i" glyph, so every variable is self-documenting.
export function Field({
  label,
  hint,
  desc,
  accepts,
  children,
}: {
  label: string;
  hint?: string;
  desc?: string;
  accepts?: string;
  children: ReactNode;
}) {
  const tip = [desc, accepts ? `Accepts: ${accepts}` : ""].filter(Boolean).join(" · ");
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-foreground">
          {label}
          <InfoTip text={tip} />
        </span>
        {hint ? <span className="font-mono text-[10px] text-muted-foreground">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

// Preset values PLUS free custom entry. A real dropdown (not a <datalist>, which
// filters its options by the current input value and so hides the list once a
// value is set): the caret shows EVERY preset; the input still accepts custom.
export function ComboInput({
  value,
  onChange,
  options,
  placeholder,
  mono = true,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  mono?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <div className="flex items-stretch">
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
          className={`w-full rounded-l-md border border-r-0 border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 ${mono ? "font-mono text-xs" : ""}`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? "Hide options" : "Show options"}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center rounded-r-md border border-border bg-card px-1.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          ▾
        </button>
      </div>
      {open && options.length > 0 ? (
        <ul className="absolute left-0 top-full z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-[var(--elevation-raised-emphasis)]">
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o);
                  setOpen(false);
                }}
                className={`block w-full px-2.5 py-1 text-left font-mono text-xs transition-colors hover:bg-accent ${
                  o === value ? "bg-sky-blue/40 text-navy" : "text-foreground"
                }`}
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-navy focus:ring-2 focus:ring-navy/20 ${
        mono ? "font-mono text-xs" : ""
      }`}
    />
  );
}

export function SelectInput({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Colour value with a live swatch + token presets + free custom entry. Accepts
// a token ref (var(--caliber-navy)), a hex, 'transparent', or color-mix(). The
// swatch resolves inside the CSS-var scope, so token refs render true.
export function ColorTokenField({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="size-8 shrink-0 rounded-md border border-border"
        style={{ background: value || "transparent" }}
      />
      <div className="min-w-0 flex-1">
        <ComboInput value={value} options={options} onChange={onChange} placeholder="var(--caliber-…) / #hex" />
      </div>
    </div>
  );
}

/** The panel shell an Edit toggle reveals. */
export function EditPanel({ children }: { children: ReactNode }) {
  return (
    <div className="no-print mt-3 rounded-lg border border-border-strong bg-muted/40 p-4">
      {children}
    </div>
  );
}

// ── Page-level toolbar (per-section reset + export) ──────────────────────────
export function PageToolbar({ section, title, blurb }: { section: Section; title: string; blurb: ReactNode }) {
  const review = useReview();
  const dirty = review.sectionDirtyCount(section);
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl text-foreground">{title}</h1>
          <p className="mt-2 max-w-[70ch] text-sm text-muted-foreground">{blurb}</p>
        </div>
        <div className="no-print flex shrink-0 items-center gap-2">
          <ChangeBadge count={dirty} label="on this page" />
          <button
            type="button"
            onClick={() => review.resetSection(section)}
            disabled={dirty === 0}
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset page
          </button>
          <ExportMenu scope={section} label="Export page" />
        </div>
      </div>
    </div>
  );
}

export function ChangeBadge({ count, label }: { count: number; label: string }) {
  if (count === 0)
    return <span className="font-mono text-xs text-muted-foreground">no changes {label}</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/25 px-2.5 py-1 font-mono text-xs text-foreground">
      <span className="size-1.5 rounded-full bg-warning" />
      {count} unsaved {count === 1 ? "change" : "changes"} {label}
    </span>
  );
}

// ── Export menu (PDF / JSON) ─────────────────────────────────────────────────
export function ExportMenu({ scope, label }: { scope: ExportScope; label: string }) {
  const review = useReview();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const doJSON = () => {
    const payload = buildExport(scope, {
      colorOverrides: review.colorOverrides,
      elevationOverrides: review.elevationOverrides,
      familyOverrides: review.familyOverrides,
      typeOverrides: review.typeOverrides,
      radiusOverrides: review.radiusOverrides,
      surfaceOverrides: review.surfaceOverrides,
      liveColor: review.liveColor,
      liveElevation: review.liveElevation,
      liveRadius: review.liveRadius,
    });
    downloadJSON(`acuity-brand-${scope}-${stamp()}.json`, payload);
    setOpen(false);
  };
  const doPDF = () => {
    setOpen(false);
    // Client navigation keeps ReviewProvider mounted, so all edits carry into
    // the render; the brand-kit page has the Save-as-PDF action.
    router.push(scope === "all" ? "/brand-kit" : `/brand-kit?scope=${scope}`);
  };
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-navy bg-navy px-3 py-1.5 text-sm text-cream transition-colors hover:bg-[var(--caliber-navy-bright)]"
      >
        {label} ▾
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border border-border bg-card shadow-[var(--elevation-overlay)]">
            <button
              type="button"
              onClick={doPDF}
              className="block w-full px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              PDF — brand-kit render
              <span className="block text-xs text-muted-foreground">printable, no edit chrome</span>
            </button>
            <button
              type="button"
              onClick={doJSON}
              className="block w-full border-t border-border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              JSON — hand back to update tokens
              <span className="block text-xs text-muted-foreground">structured diff, canonical paths</span>
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
