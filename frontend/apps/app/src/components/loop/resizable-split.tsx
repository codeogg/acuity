"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@acuity/ui";

// A self-contained resizable horizontal split (left preview / right form). The
// design-kit ships a Resizable set, but it depends on react-resizable-panels
// whose types aren't resolvable from the app's scope under pnpm; rather than
// alias another transitive dependency, this app-local split gives the same
// resizable-divider-with-min/max behaviour with no extra dependency. Keyboard-
// focusable handle (arrow keys nudge the split), min/max so neither pane
// collapses below legibility. Hover changes colour only (no geometry change).

export function ResizableSplit({
  left,
  right,
  defaultLeftPct = 42,
  minPct = 28,
  maxPct = 60,
  ariaLabel,
}: {
  left: ReactNode;
  right: ReactNode;
  defaultLeftPct?: number;
  minPct?: number;
  maxPct?: number;
  ariaLabel?: string;
}) {
  const [leftPct, setLeftPct] = useState(defaultLeftPct);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const clamp = useCallback(
    (pct: number) => Math.min(maxPct, Math.max(minPct, pct)),
    [minPct, maxPct],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(clamp(pct));
    },
    [clamp],
  );

  const stopDrag = useCallback(() => {
    draggingRef.current = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", stopDrag);
    document.body.style.userSelect = "";
  }, [onPointerMove]);

  const startDrag = useCallback(() => {
    draggingRef.current = true;
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", stopDrag);
  }, [onPointerMove, stopDrag]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setLeftPct((p) => clamp(p - 2));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setLeftPct((p) => clamp(p + 2));
    }
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-128 w-full">
      <div style={{ width: `${leftPct}%` }} className="h-full min-w-0 pr-1.5">
        {left}
      </div>
      {/* A focusable window-splitter: ARIA treats a separator with tabindex
          as interactive (the windowsplitter pattern); the jsx-a11y rules
          predate that distinction. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- ARIA windowsplitter: a focusable separator is interactive by spec */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={ariaLabel}
        aria-valuenow={Math.round(leftPct)}
        aria-valuemin={minPct}
        aria-valuemax={maxPct}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- ARIA windowsplitter: a focusable separator is interactive by spec
        tabIndex={0}
        onPointerDown={startDrag}
        onKeyDown={onKeyDown}
        className={cn(
          "group flex w-3 shrink-0 cursor-col-resize items-center justify-center",
          "focus-visible:outline-none",
        )}
      >
        <span
          className={cn(
            "h-16 w-1 rounded-full bg-border transition-colors duration-[120ms]",
            "group-hover:bg-[var(--color-border-strong)] group-focus-visible:bg-primary",
          )}
        />
      </div>
      <div style={{ width: `${100 - leftPct}%` }} className="h-full min-w-0 pl-1.5">
        {right}
      </div>
    </div>
  );
}
