// Doctor claims flow — the core status machine, fully fleshed.
//   DRAFT -> AI_FILLED -> CONFIRMED -> PRINTED (+ CANCELLED).
// All routes under /api/doctor/*; the backend scopes them to the token's
// clinic_id (tenant isolation). Cross-tenant access returns 404 -> ApiError
// kind "not_found". Field edits round-trip nothing extra here; template-field
// editing (409 optimistic lock) lives in the admin templates module.

import type {
  ClaimCreate,
  ClaimListItem,
  ClaimOut,
  CompanyBrief,
  DraftSave,
  DraftSaveResponse,
  FieldsUpdate,
  GeneratePdfResponse,
  HomeOverview,
  MedicalRecordSubmit,
  Page,
  ReuseRequest,
  ReuseResponse,
  TemplateBrief,
} from "@acuity/types";
import { api } from "../client";

// Dashboard overview (stats + drafts + shortcuts + recent).
export function getHomeOverview(): Promise<HomeOverview> {
  return api.get<HomeOverview>("/doctor/home/overview");
}

// Companies enabled for the doctor's clinic.
export function listEnabledCompanies(): Promise<CompanyBrief[]> {
  return api.get<CompanyBrief[]>("/doctor/insurance-companies");
}

// Published templates for a company.
export function listCompanyTemplates(companyId: number): Promise<TemplateBrief[]> {
  return api.get<TemplateBrief[]>(
    `/doctor/insurance-companies/${companyId}/templates`,
  );
}

// Create a claim (DRAFT).
export function createClaim(body: ClaimCreate): Promise<ClaimOut> {
  return api.post<ClaimOut>("/doctor/claims", body);
}

// A type alias (not interface) so it is assignable to the client's query index
// signature.
export type ListClaimsQuery = {
  patient_name?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
};

export function listClaims(query: ListClaimsQuery = {}): Promise<Page<ClaimListItem>> {
  return api.get<Page<ClaimListItem>>("/doctor/claims", { query });
}

export function getClaim(claimId: number): Promise<ClaimOut> {
  return api.get<ClaimOut>(`/doctor/claims/${claimId}`);
}

// Save patient name + medical record (DRAFT only).
export function saveDraft(claimId: number, body: DraftSave): Promise<DraftSaveResponse> {
  return api.put<DraftSaveResponse>(`/doctor/claims/${claimId}/draft`, body);
}

// Run AI on the saved draft record.
export function extractClaim(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/extract`);
}

// Submit record + trigger AI (-> AI_FILLED).
export function submitMedicalRecord(
  claimId: number,
  body: MedicalRecordSubmit,
): Promise<ClaimOut> {
  return api.put<ClaimOut>(`/doctor/claims/${claimId}/medical-record`, body);
}

// Edit final field values (+ change log).
export function updateClaimFields(claimId: number, body: FieldsUpdate): Promise<ClaimOut> {
  return api.put<ClaimOut>(`/doctor/claims/${claimId}/fields`, body);
}

// Validate required + confirm (-> CONFIRMED).
export function confirmClaim(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/confirm`);
}

// Render filled PDF.
export function generateClaimPdf(claimId: number): Promise<GeneratePdfResponse> {
  return api.post<GeneratePdfResponse>(`/doctor/claims/${claimId}/generate-pdf`);
}

// Mark printed (-> PRINTED).
export function markClaimPrinted(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/mark-printed`);
}

// Void (-> CANCELLED).
export function cancelClaim(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/cancel`);
}

// Clone claim values into a new template.
export function reuseClaimForTemplate(
  claimId: number,
  body: ReuseRequest,
): Promise<ReuseResponse> {
  return api.post<ReuseResponse>(`/doctor/claims/${claimId}/reuse-for-template`, body);
}
