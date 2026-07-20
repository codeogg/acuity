import { cn } from "@/lib/cn";
import { CheckIcon, ClockIcon, FileIcon, LinkIcon, SignIcon } from "@acuity/ui";

// The synthetic doctor "review surface" figure — the one --shadow-soft standout
// element on the marketing hero / how-it-works / per-insurer pages. All data is
// SYNTHETIC; no PHI ever appears on a public page. Built from the caliber
// components spec: review field row, four-status field-state dots, linked-
// evidence source pane. Purely presentational; copy is passed in per locale.

export type FieldStatus = "confirmed" | "drafted" | "needs" | "optional";

export type MockField = {
  label: string;
  value: string;
  status: FieldStatus;
  category?: string;
  linked?: boolean;
  required?: boolean;
  placeholder?: boolean;
};

// A source paragraph is a run of segments so a highlighted evidence span can
// sit INLINE within its sentence (reference: <p>… <mark>…</mark> …</p>) —
// never a whole-paragraph-or-nothing mark.
export type MockSegment = { text: string; mark?: boolean };

export type ReviewMockCopy = {
  panelLabel: string; // "Acuity · Review"
  chip: string; // e.g. "Bupa · Outpatient"
  synthetic?: string; // "Synthetic data"
  sourceHead: string; // "From your record"
  sourceParagraphs: MockSegment[][];
  statusLabels: Record<FieldStatus, string>;
  linkedLabel: string; // "Source linked" / home: "From your record"
  figureLabel: string; // localised figure aria-label, varies per page
  footNote?: string; // "3 drafted · 1 needs you" / "Acuity drafts. You decide."
  signLabel: string; // "Sign"
};

// Product grammar (work-home hint rows): the DOT carries the state colour,
// the label stays ink — the state hues sit at 3.4–3.9:1 as 12px text on card.
const statusDot: Record<FieldStatus, { text: string; dot: string }> = {
  confirmed: { text: "text-foreground", dot: "bg-state-confirmed" },
  drafted: { text: "text-foreground", dot: "bg-state-drafted" },
  needs: { text: "text-foreground", dot: "bg-state-needs" },
  optional: { text: "text-muted-foreground", dot: "bg-state-optional" },
};

function StatusDot({ status, label }: { status: FieldStatus; label: string }) {
  const s = statusDot[status];
  return (
    <span className={cn("inline-flex items-center gap-2 text-xs", s.text)}>
      <span className={cn("size-2 flex-none rounded-full", s.dot)} />
      {label}
    </span>
  );
}

export function ReviewMock({
  copy,
  fields,
  className,
}: {
  copy: ReviewMockCopy;
  fields: MockField[];
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "m-0 overflow-hidden rounded-card border border-border bg-card shadow-sm",
        className,
      )}
      aria-label={copy.figureLabel}
    >
      {/* window chrome bar */}
      <div className="flex items-center gap-3 border-b border-border bg-cream px-4 py-3">
        <span className="font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          {copy.panelLabel}
        </span>
        <span className="flex-1" />
        <span className="inline-flex items-center gap-1 rounded-md border border-venice/20 bg-venice/8 px-2 py-0.75 font-mono text-chip uppercase tracking-chip text-venice">
          {copy.chip}
        </span>
        {copy.synthetic ? (
          <span className="font-mono text-tag uppercase tracking-tag text-muted-foreground">
            {copy.synthetic}
          </span>
        ) : null}
      </div>

      {/* split body: fields + source (splits at the 560px mock breakpoint) */}
      <div className="grid grid-cols-1 mock:grid-cols-[1.05fr_0.95fr]">
        <div className="flex flex-col gap-4 p-4">
          {fields.map((f, i) => (
            <div key={i}>
              {f.category ? (
                <div className="mb-0.5 font-mono text-chip uppercase tracking-eyebrow text-muted-foreground">
                  {f.category}
                </div>
              ) : null}
              <div className="flex flex-col gap-1">
                <div className="inline-flex items-center gap-1 text-sm font-medium text-ink">
                  {f.label}
                  {f.required ? <span className="text-cranberry-deep">*</span> : null}
                </div>
                <div
                  className={cn(
                    "flex min-h-10 items-center gap-2 rounded-md border bg-card px-3 py-2.25 text-sm",
                    f.linked ? "mock-linked-input border-glaucous" : "border-border",
                  )}
                >
                  <span className={cn("flex-1", f.placeholder ? "text-muted-foreground" : "text-ink")}>
                    {f.value}
                  </span>
                  {!f.placeholder ? (
                    <span className="inline-flex size-5.5 flex-none items-center justify-center text-eucalyptus">
                      <CheckIcon className="size-4" strokeWidth={2} />
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <StatusDot status={f.status} label={copy.statusLabels[f.status]} />
                  {f.linked ? (
                    <span className="inline-flex items-center gap-1 text-xs text-venice">
                      <LinkIcon className="size-3.25" strokeWidth={1.6} />
                      {copy.linkedLabel}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mock-source border-t border-border bg-cream-contrast p-4 text-sm leading-[1.7] text-ink-muted mock:border-l mock:border-t-0">
          <div className="mb-3 flex items-center gap-2 font-mono text-chip uppercase tracking-eyebrow text-muted-foreground">
            <FileIcon className="size-3.5" />
            {copy.sourceHead}
          </div>
          {copy.sourceParagraphs.map((para, i) => (
            <p key={i} className="mb-3">
              {para.map((seg, j) =>
                seg.mark ? <mark key={j}>{seg.text}</mark> : <span key={j}>{seg.text}</span>,
              )}
            </p>
          ))}
        </div>
      </div>

      {/* slim assistive footer row */}
      {copy.footNote ? (
        <div className="flex items-center justify-between gap-3 border-t border-border bg-cream px-4 py-3">
          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <ClockIcon className="size-4" />
            {copy.footNote}
          </span>
          <span
            aria-hidden="true"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-navy px-4 text-sm font-medium text-on-navy"
          >
            <SignIcon className="size-4" />
            {copy.signLabel}
          </span>
        </div>
      ) : null}
    </figure>
  );
}
