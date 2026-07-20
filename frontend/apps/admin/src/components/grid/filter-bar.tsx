"use client";

// Inline filter row — per-column filter controls driving server re-renders via
// URL search params (filter state lives in the URL; filtering is a server
// re-render, never a client sort). Keyword input debounces into `keyword`;
// UrlSelect writes its own param. Collapses gracefully on narrow widths.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { usePathname, useRouter } from "@acuity/i18n/navigation";
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";

export function FilterRow({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-6 py-3">{children}</div>
  );
}

export function KeywordSearch({ placeholder }: { placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("keyword") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search from anywhere on the grid (keyboard-efficiency
  // accelerator; inert while any form control already owns focus).
  useEffect(() => {
    function onSlash(event: globalThis.KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest("input, select, textarea, [contenteditable]")) return;
      inputRef.current?.focus();
      event.preventDefault();
    }
    document.addEventListener("keydown", onSlash);
    return () => document.removeEventListener("keydown", onSlash);
  }, []);

  const apply = useCallback(
    (keyword: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (keyword) params.set("keyword", keyword);
      else params.delete("keyword");
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const id = setTimeout(() => {
      if ((searchParams.get("keyword") ?? "") !== value) apply(value);
    }, 300);
    return () => clearTimeout(id);
  }, [value, apply, searchParams]);

  return (
    <div className="relative w-60">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
        <AcuityIcon name="search" size={16} />
      </span>
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-keyshortcuts="/"
        className="h-8 pl-9"
      />
    </div>
  );
}

export function UrlSelect({
  param,
  options,
  allLabel,
  label,
  width = "10rem",
}: {
  param: string;
  options: { value: string; label: string }[];
  /** The "all" option label; selecting it clears the param. */
  allLabel: string;
  label: string;
  width?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(param) ?? "all";

  function apply(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete(param);
    else params.set(param, next);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <Select value={current} onValueChange={apply}>
      <SelectTrigger aria-label={label} className="h-8" style={{ width }}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FilterNote({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}
