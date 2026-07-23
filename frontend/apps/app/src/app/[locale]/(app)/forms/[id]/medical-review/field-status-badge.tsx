"use client";

import { StatusBadge, cn, type StatusTone } from "@acuity/ui";

/** Confidence below this → warn doctor to verify (product: 70%). */
export const FIELD_CONFIDENCE_THRESHOLD = 0.7;

export type ReviewFieldMeta = {
  value: string | null;
  status: string;
  confidence: number;
  validation_error?: string | null;
  page?: number | null;
  source_page?: number | null;
  bbox?: number[] | null;
  source_text?: string | null;
  raw_label?: string | null;
  /** Ambiguous / conflict candidate values (string or `{ value }`). */
  candidates?: Array<string | { value?: string | null }> | null;
};

export type FieldBadgeKind =
  | "missing"
  | "ambiguous"
  | "conflict"
  | "modified"
  | "extracted-low"
  | "extracted-ok";

export type ResolvedFieldBadge = {
  kind: FieldBadgeKind;
  tone: StatusTone;
  /** Soft presentation for routine high-confidence extracts. */
  subtle: boolean;
  /** Group “needs review” count / card highlight. */
  needsAttention: boolean;
  confidencePercent?: number;
};

function normalizeValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function isFieldValueModified(
  current: string | null | undefined,
  aiOriginal: string | null | undefined,
): boolean {
  return normalizeValue(current) !== normalizeValue(aiOriginal);
}

export function resolveFieldBadge(opts: {
  status: string;
  confidence: number;
  currentValue: string | null | undefined;
  aiOriginalValue: string | null | undefined;
}): ResolvedFieldBadge {
  const status = (opts.status || "").toLowerCase();
  const percent = Math.round(Math.max(0, Math.min(1, opts.confidence ?? 0)) * 100);

  if (status === "missing") {
    return { kind: "missing", tone: "danger", subtle: false, needsAttention: true };
  }
  if (status === "ambiguous") {
    return { kind: "ambiguous", tone: "warning", subtle: false, needsAttention: true };
  }
  if (status === "conflict_between_models" || status === "conflict") {
    return { kind: "conflict", tone: "danger", subtle: false, needsAttention: true };
  }

  // extracted / low_confidence / unknown extract-like
  const modified = isFieldValueModified(opts.currentValue, opts.aiOriginalValue);
  if (modified) {
    return { kind: "modified", tone: "neutral", subtle: false, needsAttention: false };
  }

  const conf = opts.confidence ?? 0;
  if (status === "low_confidence" || conf < FIELD_CONFIDENCE_THRESHOLD) {
    return {
      kind: "extracted-low",
      tone: "warning",
      subtle: false,
      needsAttention: true,
      confidencePercent: percent,
    };
  }

  return {
    kind: "extracted-ok",
    tone: "success",
    subtle: true,
    needsAttention: false,
    confidencePercent: percent,
  };
}

export function fieldSourceParts(field: ReviewFieldMeta): {
  page: number | null;
  rawLabel: string | null;
} {
  const page = field.source_page ?? field.page ?? null;
  const rawLabel = (field.raw_label ?? field.source_text ?? "").trim() || null;
  return { page, rawLabel };
}

export function fieldCandidates(field: ReviewFieldMeta): string[] {
  if (!Array.isArray(field.candidates)) return [];
  const out: string[] = [];
  for (const item of field.candidates) {
    if (typeof item === "string" && item.trim()) out.push(item.trim());
    else if (item && typeof item === "object" && typeof item.value === "string" && item.value.trim()) {
      out.push(item.value.trim());
    }
  }
  return out;
}

export type AiRawResultMap = Record<
  string,
  string | { value?: string | null; confidence?: number } | null
> | null;

export function aiOriginalFromRaw(
  aiRaw: AiRawResultMap | undefined,
  code: string,
): string | null | undefined {
  if (!aiRaw) return undefined;
  const entry = aiRaw[code];
  if (entry == null) return undefined;
  if (typeof entry === "string") return entry;
  if (typeof entry === "object" && "value" in entry) return entry.value ?? null;
  return undefined;
}

type FieldStatusBadgeProps = {
  kind: FieldBadgeKind;
  tone: StatusTone;
  subtle?: boolean;
  confidencePercent?: number;
  tooltip?: string | null;
  labels: {
    missing: string;
    ambiguous: string;
    conflict: string;
    modified: string;
    extractedLow: (percent: number) => string;
    extractedOk: (percent: number) => string;
  };
  className?: string;
};

export function FieldStatusBadge({
  kind,
  tone,
  subtle = false,
  confidencePercent = 0,
  tooltip,
  labels,
  className,
}: FieldStatusBadgeProps) {
  const label =
    kind === "missing"
      ? labels.missing
      : kind === "ambiguous"
        ? labels.ambiguous
        : kind === "conflict"
          ? labels.conflict
          : kind === "modified"
            ? labels.modified
            : kind === "extracted-low"
              ? labels.extractedLow(confidencePercent)
              : labels.extractedOk(confidencePercent);

  return (
    <span
      className={cn("group relative inline-flex max-w-full", className)}
      title={tooltip ?? undefined}
    >
      <StatusBadge
        tone={tone}
        label={label}
        appearance={subtle ? "outline" : "tint"}
        className={cn(
          "max-w-full truncate",
          subtle && "opacity-75 font-normal",
        )}
      />
      {tooltip ? (
        <span
          role="tooltip"
          className={cn(
            "pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 w-max max-w-[16rem]",
            "rounded-md bg-foreground px-2 py-1 text-[10px] leading-snug text-background shadow-md",
            "opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        >
          {tooltip}
        </span>
      ) : null}
    </span>
  );
}
