"use client";

// Client re-export seam: the shared StatusBadge executes design-kit
// client-bundle utilities (cn / color-mix helpers), so server components must
// reference it through a client boundary. Dissolves with the upstream
// server-safe utility entry (see ops-grid-bridge.tsx).

export { StatusBadge } from "@acuity/ui";
