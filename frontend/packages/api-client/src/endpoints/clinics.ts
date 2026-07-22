// Admin clinics — the CRUD + paging + status-toggle pattern every admin entity
// group (doctors, insurance-companies, standard-fields) follows. Later waves
// extend the other groups from this shape. All routes under /api/admin/clinics.

import type {
  ClinicConfigOverview,
  ClinicCreate,
  ClinicInsuranceUpdate,
  ClinicOut,
  ClinicStatusUpdate,
  ClinicSubscriptionNoteUpdate,
  ClinicSubscriptionOut,
  ClinicSubscriptionUpdate,
  ClinicRetentionAuditOut,
  ClinicRetentionOut,
  ClinicRetentionOverrideRequest,
  ClinicTemplatesSet,
  ClinicTemplatesSetResult,
  ClinicUpdate,
  CompanyEnableResult,
  CompanyEnableUpdate,
  Page,
  TemplateEnableResult,
  TemplateEnableUpdate,
} from "@acuity/types";
import { api } from "../client";

export type {
  ClinicSubscriptionNoteUpdate,
  ClinicSubscriptionOut,
  ClinicSubscriptionUpdate,
  ClinicRetentionAuditOut,
  ClinicRetentionOut,
  ClinicRetentionOverrideRequest,
};

// A type alias (not interface) so it is assignable to the client's query index
// signature.
export type ListClinicsQuery = {
  page?: number;
  page_size?: number;
  keyword?: string;
  /** 1 = needs attention only; 0 = unflagged only */
  is_flagged?: number;
  /** name | code | status | doctors | created_at; prefix - for descending */
  sort?: string;
};

export function listClinics(query: ListClinicsQuery = {}): Promise<Page<ClinicOut>> {
  return api.get<Page<ClinicOut>>("/admin/clinics", { query });
}

export function getClinic(clinicId: number): Promise<ClinicOut> {
  return api.get<ClinicOut>(`/admin/clinics/${clinicId}`);
}

export function createClinic(body: ClinicCreate): Promise<ClinicOut> {
  return api.post<ClinicOut>("/admin/clinics", body);
}

export function updateClinic(clinicId: number, body: ClinicUpdate): Promise<ClinicOut> {
  return api.put<ClinicOut>(`/admin/clinics/${clinicId}`, body);
}

export function setClinicStatus(
  clinicId: number,
  body: ClinicStatusUpdate,
): Promise<ClinicOut> {
  return api.patch<ClinicOut>(`/admin/clinics/${clinicId}/status`, body);
}

export function setClinicFlag(
  clinicId: number,
  body: { is_flagged: number },
): Promise<ClinicOut> {
  return api.patch<ClinicOut>(`/admin/clinics/${clinicId}/flag`, body);
}

// 204 No Content on success.
export function deleteClinic(clinicId: number): Promise<void> {
  return api.delete<void>(`/admin/clinics/${clinicId}`);
}

export function getClinicInsurers(clinicId: number): Promise<number[]> {
  return api.get<number[]>(`/admin/clinics/${clinicId}/insurance-companies`);
}

export function setClinicInsurers(
  clinicId: number,
  body: ClinicInsuranceUpdate,
): Promise<number[]> {
  return api.put<number[]>(`/admin/clinics/${clinicId}/insurance-companies`, body);
}

// Full per-clinic configuration snapshot: companies + templates + enablement.
export function getClinicConfigOverview(clinicId: number): Promise<ClinicConfigOverview> {
  return api.get<ClinicConfigOverview>(`/admin/clinics/${clinicId}/config-overview`);
}

// Toggle one insurer on/off for a clinic.
export function setClinicCompanyEnablement(
  clinicId: number,
  companyId: number,
  body: CompanyEnableUpdate,
): Promise<CompanyEnableResult> {
  return api.patch<CompanyEnableResult>(
    `/admin/clinics/${clinicId}/insurance-companies/${companyId}`,
    body,
  );
}

// Toggle one template on/off for a clinic.
export function setClinicTemplateEnablement(
  clinicId: number,
  templateId: number,
  body: TemplateEnableUpdate,
): Promise<TemplateEnableResult> {
  return api.patch<TemplateEnableResult>(
    `/admin/clinics/${clinicId}/templates/${templateId}`,
    body,
  );
}

// Replace the enabled-template set for one company at a clinic. Canonical path
// per the contract normalisation (the demo backend serves the old /companies/
// segment; the rename lands backend-side at integration).
export function setClinicCompanyTemplates(
  clinicId: number,
  companyId: number,
  body: ClinicTemplatesSet,
): Promise<ClinicTemplatesSetResult> {
  return api.put<ClinicTemplatesSetResult>(
    `/admin/clinics/${clinicId}/insurance-companies/${companyId}/templates`,
    body,
  );
}

// --- subscription (1:1 commercial record) --------------------------------------

export function getClinicSubscription(clinicId: number): Promise<ClinicSubscriptionOut> {
  return api.get<ClinicSubscriptionOut>(`/admin/clinics/${clinicId}/subscription`);
}

export function updateClinicSubscription(
  clinicId: number,
  body: ClinicSubscriptionUpdate,
): Promise<ClinicSubscriptionOut> {
  return api.put<ClinicSubscriptionOut>(`/admin/clinics/${clinicId}/subscription`, body);
}

export function updateClinicSubscriptionNote(
  clinicId: number,
  body: ClinicSubscriptionNoteUpdate,
): Promise<ClinicSubscriptionOut> {
  return api.patch<ClinicSubscriptionOut>(`/admin/clinics/${clinicId}/subscription/note`, body);
}

// --- retention (global default + per-clinic override + audit) -------------------

export function getClinicRetention(clinicId: number): Promise<ClinicRetentionOut> {
  return api.get<ClinicRetentionOut>(`/admin/clinics/${clinicId}/retention`);
}

export function overrideClinicRetention(
  clinicId: number,
  body: ClinicRetentionOverrideRequest,
): Promise<ClinicRetentionOut> {
  return api.post<ClinicRetentionOut>(`/admin/clinics/${clinicId}/retention/override`, body);
}

export function listClinicRetentionHistory(
  clinicId: number,
): Promise<ClinicRetentionAuditOut[]> {
  return api.get<ClinicRetentionAuditOut[]>(`/admin/clinics/${clinicId}/retention/history`);
}
