"use client";

import * as React from "react";

import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  value: number;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
}: SearchableSelectProps) {
  const { t } = useI18n();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  React.useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-lg border border-[var(--color-input)] bg-transparent px-3 text-left text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50",
          !selected && "text-[var(--color-muted-foreground)]",
        )}
      >
        <span className="truncate">
          {selected ? selected.label : (placeholder ?? t("common.select"))}
        </span>
        <span className="ml-2 text-[var(--color-muted-foreground)]">▾</span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] shadow-lg">
          <div className="p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("common.searchKeyword")}
              className="h-8 w-full rounded-md border border-[var(--color-input)] bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            />
          </div>
          <ul className="max-h-56 overflow-auto pb-1 text-sm">
            {filtered.length === 0 && (
              <li className="px-3 py-2 text-[var(--color-muted-foreground)]">
                {t("common.noMatches")}
              </li>
            )}
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "block w-full px-3 py-2 text-left hover:bg-[var(--color-muted)]",
                    o.value === value && "bg-[var(--color-muted)] font-medium",
                  )}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
