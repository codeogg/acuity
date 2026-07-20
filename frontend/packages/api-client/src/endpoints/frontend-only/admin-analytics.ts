// frontend-only: pending backend
//
// Console analytics aggregates (INSIGHTS destination + the dashboard's
// forms-processed / verify-split cards). No aggregates endpoints exist in the
// contract; everything is mock-first from fixtures. Exports are surrogate-only
// and logged as audit events.

import type {
  ActivationFunnel,
  AnalyticsExportRequest,
  AnalyticsExportResult,
  AnalyticsOverview,
  QualityReport,
  QualityTrendPoint,
  UsagePoint,
  VerificationReport,
} from "@acuity/types";
import { api } from "../../client";

export type {
  ActivationFunnel,
  AnalyticsExportRequest,
  AnalyticsExportResult,
  AnalyticsOverview,
  QualityReport,
  QualityTrendPoint,
  UsagePoint,
  VerificationReport,
};

// A type alias (not interface) so it is assignable to the client's query index
// signature.
export type UsageQuery = {
  range_days?: number;
  clinic_id?: number;
  doctor_id?: number;
};

export function getAnalyticsOverview(): Promise<AnalyticsOverview> {
  return api.get<AnalyticsOverview>("/admin/analytics/overview");
}

export function getUsageSeries(query: UsageQuery = {}): Promise<UsagePoint[]> {
  return api.get<UsagePoint[]>("/admin/analytics/usage", { query });
}

export function getActivationFunnel(): Promise<ActivationFunnel> {
  return api.get<ActivationFunnel>("/admin/analytics/funnel");
}

export function getVerificationReport(): Promise<VerificationReport> {
  return api.get<VerificationReport>("/admin/analytics/verification");
}

export function getQualityReport(): Promise<QualityReport> {
  return api.get<QualityReport>("/admin/analytics/quality");
}

// Surrogate-only export; the mock records an `export` audit event.
export function exportAnalytics(body: AnalyticsExportRequest): Promise<AnalyticsExportResult> {
  return api.post<AnalyticsExportResult>("/admin/analytics/export", body);
}
