"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  cn,
} from "@component-core/ui";

// Interactive half of the console operations-grid grammar (see ops-grid.tsx):
//   - BulkSelectionProvider / BulkSelectCheckbox / BulkSelectAllCheckbox /
//     BulkActionBar: multi-select over a server-rendered OpsDataTable via a
//     client context, with the contextual action bar that appears on selection.
//   - DetailDrawer: the right-edge 560px detail overlay (Escape dismisses;
//     outside click does not).
//   - ConfirmGateDialog: the deliberate-confirm gate for high-consequence
//     actions - "ack" (checkbox acknowledgement) or "paste" (the identifier
//     must be pasted to proceed; typing friction is the point).
// All labels arrive localised from the caller; nothing here touches i18n.

// --- Bulk selection -----------------------------------------------------------

interface BulkSelectionState {
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  setMany: (ids: string[], on: boolean) => void;
  clear: () => void;
}

const BulkSelectionContext = createContext<BulkSelectionState | null>(null);

export function useBulkSelection(): BulkSelectionState {
  const ctx = useContext(BulkSelectionContext);
  if (!ctx) throw new Error("useBulkSelection requires a <BulkSelectionProvider>");
  return ctx;
}

export function BulkSelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const setMany = useCallback((ids: string[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);
  const clear = useCallback(() => setSelected(new Set()), []);
  const value = useMemo(
    () => ({ selected, toggle, setMany, clear }),
    [selected, toggle, setMany, clear],
  );
  return (
    <BulkSelectionContext.Provider value={value}>
      {children}
    </BulkSelectionContext.Provider>
  );
}

/** Row checkbox - render via OpsDataTable's `leading` slot. */
export function BulkSelectCheckbox({ id, label }: { id: string; label: string }) {
  const { selected, toggle } = useBulkSelection();
  return (
    <Checkbox
      checked={selected.has(id)}
      onCheckedChange={() => toggle(id)}
      aria-label={label}
    />
  );
}

/** Select-all checkbox for the visible page - render via `leadingHeader`. */
export function BulkSelectAllCheckbox({ ids, label }: { ids: string[]; label: string }) {
  const { selected, setMany } = useBulkSelection();
  const on = ids.filter((id) => selected.has(id)).length;
  const state: boolean | "indeterminate" =
    on === 0 ? false : on === ids.length ? true : "indeterminate";
  return (
    <Checkbox
      checked={state}
      onCheckedChange={(next) => setMany(ids, next === true)}
      aria-label={label}
    />
  );
}

/**
 * Contextual action bar - appears when the selection is non-empty. Action
 * buttons arrive as children (client components consuming useBulkSelection);
 * high-consequence actions open a ConfirmGateDialog with a DryRunPreview.
 */
export function BulkActionBar({
  selectedLabel,
  clearLabel,
  children,
  className,
}: {
  /** Rendered after the count, already localised ("selected" / "已選取"). */
  selectedLabel: string;
  clearLabel: string;
  children?: ReactNode;
  className?: string;
}) {
  const { selected, clear } = useBulkSelection();
  if (selected.size === 0) return null;
  return (
    <div
      role="status"
      className={cn(
        "sticky bottom-4 z-30 mx-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-4 py-2.5 shadow-md",
        className,
      )}
    >
      <span className="shrink-0 text-sm font-medium text-foreground tabular-nums">
        {selected.size} {selectedLabel}
      </span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 [&>*]:shrink-0">
        {children}
      </div>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={clear}>
        {clearLabel}
      </Button>
    </div>
  );
}

// --- Keyboard grid navigation ---------------------------------------------------

// The focus target inside a row: the trailing open link when present, else
// the first interactive element (queue rows carry an action button instead).
function rowTarget(row: HTMLTableRowElement): HTMLElement | null {
  const cells = row.querySelectorAll<HTMLElement>(
    "a[href], button:not([role='checkbox'])",
  );
  return cells[cells.length - 1] ?? row.querySelector<HTMLElement>("a[href], button");
}

/**
 * Keyboard layer for a grid wrapper (WAI-ARIA APG grid-lite): keyboard-
 * efficient row traversal for repeated table work — ArrowDown/ArrowUp (and
 * j/k) move focus across row targets, Enter opens the focused row link
 * natively, Space or x toggles the row's bulk-selection checkbox. Keys are
 * inert while an input, select, textarea or dialog owns focus; pointer
 * parity is untouched (the keys are an accelerator, never the only path).
 *
 * Pass a ref to the (non-interactive) element wrapping the table: the keys
 * ride a native listener there and act on whichever row element already owns
 * focus, so the wrapper itself never enters the tab order.
 */
export function useOpsGridKeyboardNav(containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement;
      // Inert while a form control or overlay owns focus (typing must win).
      if (target.closest("input, select, textarea, [contenteditable], [role='dialog']")) {
        return;
      }
      const row = target.closest("tr");
      if (!container || !row) return;
      const bodyRows = Array.from(
        container.querySelectorAll<HTMLTableRowElement>("tbody tr"),
      );
      const index = bodyRows.indexOf(row as HTMLTableRowElement);
      if (index < 0) return;

      if (event.key === "ArrowDown" || event.key === "j") {
        const next = bodyRows[Math.min(index + 1, bodyRows.length - 1)];
        if (next) rowTarget(next)?.focus();
        event.preventDefault();
      } else if (event.key === "ArrowUp" || event.key === "k") {
        const previous = bodyRows[Math.max(index - 1, 0)];
        if (previous) rowTarget(previous)?.focus();
        event.preventDefault();
      } else if (event.key === "x" || (event.key === " " && target.tagName === "A")) {
        const checkbox = row.querySelector<HTMLElement>("button[role='checkbox']");
        if (checkbox) {
          checkbox.click();
          event.preventDefault();
        }
      }
    }
    container.addEventListener("keydown", onKeyDown);
    return () => container.removeEventListener("keydown", onKeyDown);
  }, [containerRef]);
}

// --- Detail drawer -------------------------------------------------------------

/**
 * Right-edge 560px detail overlay over a grid - the console's drawer pattern
 * for clinic/doctor/ticket detail. Escape dismisses; outside click does not.
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("w-full gap-0 p-0 sm:w-[560px] sm:max-w-[560px]", className)}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <SheetHeader className="border-b border-border px-6 py-4">
          <SheetTitle className="font-title text-xl">{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-border px-6 py-4">{footer}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

// --- Deliberate-confirm gate -----------------------------------------------------

export interface ConfirmGateStrings {
  confirmLabel: string;
  cancelLabel: string;
  /** ack variant: the acknowledgement checkbox label. */
  ackLabel?: string;
  /** paste variant: the instruction line above the identifier. */
  pasteInstruction?: string;
  /** paste variant: the input placeholder / aria-label. */
  pastePlaceholder?: string;
}

/**
 * The deliberate-confirm gate for high-consequence operator actions. Two
 * variants: "ack" (checkbox acknowledgement, lower consequence) and "paste"
 * (the surrogate identifier must be pasted to proceed - destructive actions).
 * Pair with DryRunPreview in `children` for bulk actions.
 */
export function ConfirmGateDialog({
  open,
  onOpenChange,
  title,
  description,
  variant,
  target,
  destructive = false,
  icon,
  strings,
  onConfirm,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  variant: "ack" | "paste";
  /** paste variant: the identifier that must be pasted back. */
  target?: string;
  destructive?: boolean;
  /** Leading glyph block (e.g. <AcuityIcon name="alert" size={20} />). */
  icon?: ReactNode;
  strings: ConfirmGateStrings;
  onConfirm: () => void;
  children?: ReactNode;
}) {
  const [pasted, setPasted] = useState("");
  const [ack, setAck] = useState(false);
  const ready = variant === "paste" ? pasted.trim() === target : ack;

  function reset() {
    setPasted("");
    setAck(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="shadow-md">
        <DialogHeader>
          <div className="mb-2 flex items-center gap-3">
            {icon ? (
              <span
                className="inline-flex rounded-md p-2"
                style={{
                  background: `color-mix(in srgb, var(--tone-${destructive ? "danger" : "info"}) 16%, transparent)`,
                  color: `var(--tone-${destructive ? "danger" : "info"})`,
                }}
              >
                {icon}
              </span>
            ) : null}
            <DialogTitle className="font-title text-2xl">{title}</DialogTitle>
          </div>
          {description ? (
            <DialogDescription asChild>
              <div className="text-sm leading-relaxed text-foreground">{description}</div>
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {children}

        {variant === "paste" ? (
          <div className="space-y-2">
            {strings.pasteInstruction ? (
              <p className="text-xs text-muted-foreground">{strings.pasteInstruction}</p>
            ) : null}
            <code className="block rounded-md border border-border bg-muted px-3 py-2.5 font-mono text-sm text-foreground">
              {target}
            </code>
            <Input
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={strings.pastePlaceholder}
              aria-label={strings.pastePlaceholder}
            />
          </div>
        ) : (
          <label className="flex cursor-pointer items-start gap-2.5 py-1">
            <Checkbox
              checked={ack}
              onCheckedChange={(next) => setAck(next === true)}
              className="mt-0.5"
            />
            <span className="text-sm text-foreground">{strings.ackLabel}</span>
          </label>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {strings.cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!ready}
            onClick={() => {
              if (!ready) return;
              onConfirm();
              onOpenChange(false);
              reset();
            }}
          >
            {strings.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
