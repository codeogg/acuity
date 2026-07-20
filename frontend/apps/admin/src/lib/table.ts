// URL-driven sort state for the ops grids: `?sort=key` (ascending) or
// `?sort=-key` (descending). Sorting is a server re-render — the page parses
// the param, sorts the rows, and OpsDataTable renders the toggle hrefs.

import type { OpsSortDirection } from "@acuity/ui";

export interface SortState {
  key: string;
  direction: OpsSortDirection;
}

export function parseSort(raw: string | undefined): SortState | null {
  if (!raw) return null;
  const desc = raw.startsWith("-");
  const key = desc ? raw.slice(1) : raw;
  if (!key) return null;
  return { key, direction: desc ? "desc" : "asc" };
}

export function sortHref(
  pathname: string,
  params: URLSearchParams,
  key: string,
  current: SortState | null,
): string {
  const next = new URLSearchParams(params);
  if (current?.key === key && current.direction === "asc") next.set("sort", `-${key}`);
  else next.set("sort", key);
  next.delete("page");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function columnSort(
  pathname: string,
  params: URLSearchParams,
  key: string,
  current: SortState | null,
): { direction: OpsSortDirection | null; href: string } {
  return {
    direction: current?.key === key ? current.direction : null,
    href: sortHref(pathname, params, key, current),
  };
}

export function compareBy<T>(
  accessor: (row: T) => string | number | null | undefined,
  direction: OpsSortDirection,
): (a: T, b: T) => number {
  const dir = direction === "desc" ? -1 : 1;
  return (a, b) => {
    const va = accessor(a) ?? "";
    const vb = accessor(b) ?? "";
    if (va < vb) return -1 * dir;
    if (va > vb) return 1 * dir;
    return 0;
  };
}
