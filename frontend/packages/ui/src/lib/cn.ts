import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// The one class-merge helper for Acuity code, server-safe. Identical semantics
// to the design-kit cn (clsx + tailwind-merge), but defined in a plain module:
// the design-kit's cn ships inside its client component bundle, so React
// Server Components cannot call it (the "attempted to call cn() from the
// server" crash). The barrel re-exports this over the star export, so
// `import { cn } from "@acuity/ui"` is safe in any rendering context. Retire
// in favour of the base package's own server-safe utility entry once the
// design-kit ships one.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
