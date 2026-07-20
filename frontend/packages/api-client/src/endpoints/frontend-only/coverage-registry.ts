// frontend-only: pending backend
//
// Coverage registry — the canonical covered-vs-roadmap insurer/form list the
// form-selection surface (and the site Trust Centre) read so coverage is never
// overstated. No backend equivalent yet; contract gap surfaced via
// x-backend-status in the canonical spec + the endpoint checklist.

import type { CoverageForm, CoverageInsurer, CoverageStatus } from "@acuity/types";
import { api } from "../../client";

export type { CoverageForm, CoverageInsurer, CoverageStatus };

export function getCoverageRegistry(): Promise<CoverageInsurer[]> {
  return api.get<CoverageInsurer[]>("/doctor/coverage-registry");
}
