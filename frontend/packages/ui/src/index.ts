// The single UI import surface for Acuity apps.
//
// Apps import components from "@acuity/ui" (never directly from "@component-core/ui")
// so the base package can be swapped or extended in one place. Acuity-only
// components (from @component-core/acuity, when they exist) are re-exported
// here alongside the design-kit roster.
//
// The visual theme is applied via CSS: import "@acuity/ui/styles.css" once in an
// app's root layout. That stylesheet layers the design-kit base tokens, the
// caliber-light overlay, and the Tailwind engine (see src/styles.css).

export * from "@component-core/ui";

// Server-safe cn shadows the star-exported client-bundled one (see lib/cn.ts).
export { cn } from "./lib/cn";

// Acuity-only components would be re-exported here, e.g.:
// export * from "@component-core/acuity/components";
// (none yet — the theme package currently ships tokens only.)

// Shared Acuity foundation components (one icon roster, one status system,
// one shell, one ops-grid grammar) - adopt these instead of per-app forks.
export * from "./icons";
export * from "./components/status-badge";
// Shadows the design-kit TableRow (an explicit export wins over the star
// re-export): flat resting rows, opt-in hover on interactive rows only.
export { TableRow } from "./components/table-row";
// Shadows the design-kit Table: the overflow container is a keyboard tab stop
// (scrollable-region-focusable) so clipped grid columns stay reachable.
export { Table } from "./components/table";
// Shadows the design-kit Loader / CenteredLoading with the house spinner
// (pure-rotation constant-stroke ring), and adds the component-level Spinner
// plus the skeleton Shimmer primitive.
export { Spinner, Loader, CenteredLoading, Shimmer } from "./components/loading";
// Shadows the design-kit compound Avatar: Acuity avatars are auto-generated
// (hashed Caliber accent ground + per-hue initials, FINAL.md avatar rule) —
// never image-based, so the compound API does not apply.
export { Avatar, avatarInitials } from "./components/avatar";
// The one confirmation toast (single transient message, success/error tones).
export { ToastProvider, useToast, type ToastTone } from "./components/toast";
// Shadows the design-kit SelectContent onto the house floating-menu grammar
// (drops below the trigger, 4px inner gutter so washes never kiss edges).
export { SelectContent } from "./components/select";
export * from "./components/acuity-shell";
export * from "./components/shell-account-menu";
export * from "./components/ops-grid";
export * from "./components/ops-grid-client";

// Webfont wiring is a separate entry point ("@acuity/ui/fonts") because
// next/font loaders belong in root layouts only.
