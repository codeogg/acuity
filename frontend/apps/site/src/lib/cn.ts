// Server-safe class joiner — the one class-merge helper for this app. The
// design-kit cn ships inside the client component bundle, so React Server
// Components cannot call it; site code composes plain, conflict-free class
// lists, so a filter-join is sufficient (the shared Button still tailwind-
// merges any className passed into it).
export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}
