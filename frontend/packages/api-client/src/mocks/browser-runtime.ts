// MSW browser-worker runtime, re-exported so apps composing their own worker
// (app-local handlers layered over the foundation set) reach `setupWorker`
// through "@acuity/api-client/mocks/browser-runtime" rather than "msw/browser"
// directly — same rationale as ./msw (no per-app msw dependency/alias).
//
// IMPORTANT: this module pulls in "msw/browser", which throws when evaluated
// outside a browser. Import it ONLY via a dynamic `await import(...)` inside a
// browser-guarded code path (typeof window !== "undefined"); never at module top
// level, or SSR/SSG evaluation will crash. The re-exported type is erased at
// build time and is safe to import with `import type`.

export { setupWorker } from "msw/browser";
export type { SetupWorker } from "msw/browser";
