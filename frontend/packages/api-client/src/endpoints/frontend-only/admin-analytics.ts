// Admin analytics aggregates — live FastAPI /api/admin/analytics*.
// MSW handlers in mocks/handlers/admin.ts still cover mock-first mode.

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
import { api, type RequestOptions } from "../../client";

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

export type UsageQuery = {
  range_days?: number;
  clinic_id?: number;
  doctor_id?: number;
};

export function getAnalyticsOverview(options?: RequestOptions): Promise<AnalyticsOverview> {
  return api.get<AnalyticsOverview>("/admin/analytics/overview", options);
}

export function getUsageSeries(
  query: UsageQuery = {},
  options?: RequestOptions,
): Promise<UsagePoint[]> {
  return api.get<UsagePoint[]>("/admin/analytics/usage", { ...options, query });
}

export function getActivationFunnel(options?: RequestOptions): Promise<ActivationFunnel> {
  return api.get<ActivationFunnel>("/admin/analytics/funnel", options);
}

export function getVerificationReport(options?: RequestOptions): Promise<VerificationReport> {
  return api.get<VerificationReport>("/admin/analytics/verification", options);
}

export function getQualityReport(options?: RequestOptions): Promise<QualityReport> {
  return api.get<QualityReport>("/admin/analytics/quality", options);
}

export function exportAnalytics(
  body: AnalyticsExportRequest,
  options?: RequestOptions,
): Promise<AnalyticsExportResult> {
  return api.post<AnalyticsExportResult>("/admin/analytics/export", body, options);
}
