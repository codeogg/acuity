// Doctor ad-hoc AI extraction — run extraction against raw record text without
// a claim (the claim-scoped POST /doctor/claims/{id}/extract is the usual path).

import type { ExtractRequest, ExtractResponse } from "@acuity/types";
import { api } from "../client";

export function extractText(body: ExtractRequest): Promise<ExtractResponse> {
  return api.post<ExtractResponse>("/doctor/ai/extract", body);
}
