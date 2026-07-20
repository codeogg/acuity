// MSW browser worker. The worker is created LAZILY inside startMockWorker (not
// at module load) because setupWorker throws in a non-browser environment —
// importing this module during SSR/SSG must be side-effect-free. Apps call
// `await startMockWorker()` from a client bootstrap when NEXT_PUBLIC_API_MOCKING
// is enabled. Requires the MSW service worker script at /mockServiceWorker.js in
// the app's public dir (copy it with `npx msw init public/`).

import type { SetupWorker } from "msw/browser";
import { handlers } from "./handlers";

let worker: SetupWorker | undefined;

export async function startMockWorker(): Promise<void> {
  if (typeof window === "undefined") return; // no-op outside the browser
  if (!worker) {
    const { setupWorker } = await import("msw/browser");
    worker = setupWorker(...handlers);
  }
  await worker.start({
    onUnhandledRequest: "bypass",
    serviceWorker: { url: "/mockServiceWorker.js" },
    quiet: true,
  });
}
