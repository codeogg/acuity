// MSW node/server request interceptor. Used for server-side rendering against
// mocks and for tests. Start it in the Node runtime (e.g. an
// instrumentation.ts register hook) when mocking is enabled.

import { setupServer } from "msw/node";
import { handlers } from "./handlers";

export const server = setupServer(...handlers);

export function startMockServer(): void {
  server.listen({ onUnhandledRequest: "bypass" });
}
