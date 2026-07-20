// Service health probe. The one contract operation NOT under /api — it lives at
// the server root, so it overrides the client's base path.

import { api } from "../client";

export interface HealthResponse {
  status: string;
}

export function getHealth(): Promise<HealthResponse> {
  return api.get<HealthResponse>("/health", { base: "" });
}
