// The one MSW handler set for every surface: the full 72-operation backend
// contract (auth + doctor + admin + the root /health probe) plus every
// FRONTEND-ONLY endpoint in ../endpoints/frontend-only.registry.json — all
// stateful over the shared fixture universe, all gated by the scenario engine
// (../mocks/scenario.ts). Apps start the shared worker (./browser) or layer
// these into their own; no app maintains a parallel mock architecture.

import { HttpResponse, http } from "msw";
import { adminHandlers } from "./handlers/admin";
import { authHandlers } from "./handlers/auth";
import { doctorHandlers } from "./handlers/doctor";
import { gate } from "./handlers/shared";

// The one contract operation NOT under /api: the root service-health probe.
export const healthHandlers = [
  http.get("/health", async ({ request }) => {
    const { deny } = await gate(request, { authed: false });
    if (deny) return deny;
    return HttpResponse.json({ status: "ok" });
  }),
];

export const handlers = [
  ...authHandlers,
  ...doctorHandlers,
  ...adminHandlers,
  ...healthHandlers,
];

export { adminHandlers, authHandlers, doctorHandlers };
