import type { ReactNode } from "react";
import { cn } from "../lib/cn";

// The one Acuity status-presentation system, reconciling the three per-surface
// forks (console .tone-* tints, doctor-app --state-* dots, site ad-hoc map).
// Status is ALWAYS colour + icon/dot + label (hard rule 5 / FINAL.md): the
// tone hues fill glyphs, dots and tint grounds only, never small text on
// cream - the label carries the meaning in the foreground ink.
//
// Two presentational layers, both bound to theme tokens
// (@component-core/acuity tokens.css):
//   - StatusBadge: the console tone grammar (tint ground + tone glyph + ink
//     label) on the six --tone-* roles; appearance "tint" (console pill) or
//     "outline" (bordered card pill with a leading dot, the doctor-app claim
//     grammar).
//   - FieldStateDot: the doctor-app four-status field-state grammar on the
//     --state-* roles (dot + optional glyph + ink label, no ground).
//
// Domain mappings (claim status -> tone/state, i18n labels) stay app-side;
// these components are pure presentation. Server-safe (no hooks).

export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "accent";

export type FieldState = "optional" | "needs-input" | "drafted" | "confirmed";

// Tint strength per tone (light hues need a stronger mix to read as a ground).
const TONE_TINT: Record<StatusTone, number> = {
  neutral: 16,
  info: 16,
  success: 18,
  warning: 30,
  danger: 16,
  accent: 16,
};

function toneVar(tone: StatusTone): string {
  return `var(--tone-${tone})`;
}

/** Glyph colour for a tone: the tone hue, except warning's darkened AA step. */
export function toneGlyphColor(tone: StatusTone): string {
  return tone === "warning" ? "var(--tone-warning-glyph)" : toneVar(tone);
}

/** Tint-ground colour for a tone (low-alpha mix over transparent). */
export function toneTintBackground(tone: StatusTone): string {
  return `color-mix(in srgb, ${toneVar(tone)} ${TONE_TINT[tone]}%, transparent)`;
}

export function StatusBadge({
  tone,
  label,
  appearance = "tint",
  className,
}: {
  tone: StatusTone;
  label: string;
  /** Accepted for API compatibility; status tags no longer render glyphs —
      the tone ground (tint) or dot (outline) plus the LABEL carry the meaning
      (still never colour alone). */
  icon?: ReactNode;
  /** "tint" = console pill on a tone tint; "outline" = bordered pill + dot. */
  appearance?: "tint" | "outline";
  className?: string;
}) {
  if (appearance === "outline") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium text-foreground",
          className,
        )}
      >
        <span
          aria-hidden
          className="size-2 rounded-full"
          style={{ background: toneVar(tone) }}
        />
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium leading-tight text-foreground",
        className,
      )}
      style={{ background: toneTintBackground(tone) }}
    >
      {label}
    </span>
  );
}

export function FieldStateDot({
  state,
  label,
  icon,
  className,
}: {
  state: FieldState;
  label: string;
  /** Glyph node; takes the state hue. */
  icon?: ReactNode;
  className?: string;
}) {
  const hue = `var(--state-${state})`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs text-foreground",
        className,
      )}
    >
      <span
        aria-hidden
        className="size-2 flex-none rounded-full"
        style={{ background: hue }}
      />
      {icon ? (
        <span className="flex" style={{ color: hue }}>
          {icon}
        </span>
      ) : null}
      <span>{label}</span>
    </span>
  );
}
