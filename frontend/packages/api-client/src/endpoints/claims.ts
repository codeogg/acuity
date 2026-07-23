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
  /** Single status or comma-separated list, e.g. `PRINTED` or `DRAFT,AI_FILLED`. */
  status?: string;
  /** Exclude status(es), e.g. `PRINTED` for in-progress lists. */
  status_ne?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
};

/** 已完成：已打印。 */
export const CLAIM_STATUS_COMPLETED = "PRINTED";

export function listClaims(query: ListClaimsQuery = {}): Promise<Page<ClaimListItem>> {
  return api.get<Page<ClaimListItem>>("/doctor/claims", { query });
}

/** 进行中：非 PRINTED。 */
export function listInProgressClaims(
  query: Omit<ListClaimsQuery, "status" | "status_ne"> = {},
): Promise<Page<ClaimListItem>> {
  return listClaims({ ...query, status_ne: CLAIM_STATUS_COMPLETED });
}

/** 已完成：仅 PRINTED。 */
export function listCompletedClaims(
  query: Omit<ListClaimsQuery, "status" | "status_ne"> = {},
): Promise<Page<ClaimListItem>> {
  return listClaims({ ...query, status: CLAIM_STATUS_COMPLETED });
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

// Validate required + confirm (-> CONFIRMED). Generates filled PDF.
export function confirmClaim(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/confirm`);
}

// Render filled PDF.
export function generateClaimPdf(claimId: number): Promise<GeneratePdfResponse> {
  return api.post<GeneratePdfResponse>(`/doctor/claims/${claimId}/generate-pdf`);
}

/** Back from preview to field review (CONFIRMED → AI_FILLED). */
export function revertClaimToReview(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/revert-to-review`);
}

// Mark printed (-> PRINTED).
export function markClaimPrinted(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/mark-printed`);
}

// Void (-> CANCELLED).
export function cancelClaim(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/cancel`);
}

/** Permanently delete a claim (204). */
export function deleteClaim(claimId: number): Promise<void> {
  return api.delete<void>(`/doctor/claims/${claimId}`);
}

// Clone claim values into a new template.
export function reuseClaimForTemplate(
  claimId: number,
  body: ReuseRequest,
): Promise<ReuseResponse> {
  return api.post<ReuseResponse>(`/doctor/claims/${claimId}/reuse-for-template`, body);
}

/** Response from POST /doctor/claims/{id}/medical-pdf (backend live; not yet in OpenAPI). */
export interface ClaimMedicalPdfUploadOutput {
  extraction_task_id: number;
  extraction_task_no: string;
  original_filename: string;
  patient_name: string | null;
}

/** Upload a medical-record PDF and create the linked extraction task. */
export function uploadMedicalPdf(
  claimId: number,
  file: File | Blob,
  patientName?: string | null,
  filename?: string,
): Promise<ClaimMedicalPdfUploadOutput> {
  const form = new FormData();
  form.append("file", file, filename ?? (file instanceof File ? file.name : "upload.pdf"));
  if (patientName) form.append("patient_name", patientName);
  return api.postForm<ClaimMedicalPdfUploadOutput>(
    `/doctor/claims/${claimId}/medical-pdf`,
    form,
  );
}

/** Absolute-ish URL for the uploaded medical PDF preview (same-origin /api proxy). */
export function medicalPdfPreviewUrl(taskNo: string): string {
  const base = (typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_API_BASE : undefined) ?? "/api";
  return `${base.replace(/\/$/, "")}/doctor/extraction-tasks/${encodeURIComponent(taskNo)}/pdf`;
}

/** Filled insurer-form PDF stream (available after generate-pdf). */
export function claimFormPdfUrl(claimId: number): string {
  const base = (typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_API_BASE : undefined) ?? "/api";
  return `${base.replace(/\/$/, "")}/doctor/claims/${claimId}/pdf`;
}

/** Fetch the filled claim PDF and trigger a browser file download. */
export async function downloadClaimFormPdf(
  claimId: number,
  fileName = `claim-${claimId}.pdf`,
): Promise<void> {
  const response = await fetch(claimFormPdfUrl(claimId), {
    credentials: "include",
    headers: { Accept: "application/pdf" },
  });
  if (!response.ok) {
    throw new Error(`Failed to download PDF (${response.status})`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export type ExtractProgressStage =
  | "IDLE"
  | "INGEST"
  | "CLASSIFY"
  | "EXTRACT"
  | "VALIDATE"
  | "DONE"
  | "FAILED"
  | "AWAITING_INPUT";

export type ExtractProgressStatus =
  | "IDLE"
  | "QUEUED"
  | "RUNNING"
  | "AWAITING_INPUT"
  | "DONE"
  | "FAILED";

export interface ExtractProgressVisit {
  visit_index: number;
  visit_date: string | null;
  summary: string | null;
  page_range: number[];
  selected: boolean;
}

export interface ExtractProgress {
  stage: ExtractProgressStage;
  percent: number;
  message: string | null;
  status: ExtractProgressStatus;
  visits?: ExtractProgressVisit[] | null;
}

export interface ExtractEnqueueResponse {
  job_id: string | null;
  status: string;
  message?: string;
}

/** Same as doctor web: enqueue PDF → AI extraction pipeline. */
export function extractFromPdf(claimId: number): Promise<ExtractEnqueueResponse> {
  return api.post<ExtractEnqueueResponse>(`/doctor/claims/${claimId}/extract-from-pdf`);
}

export function getExtractProgress(claimId: number): Promise<ExtractProgress> {
  return api.get<ExtractProgress>(`/doctor/claims/${claimId}/extract-progress`);
}

export function cancelExtraction(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/cancel-extraction`);
}

export function resumeExtraction(
  claimId: number,
  visitIndex: number,
): Promise<ExtractEnqueueResponse> {
  return api.post<ExtractEnqueueResponse>(`/doctor/claims/${claimId}/resume-extraction`, {
    visit_index: visitIndex,
  });
}

export function applyExtraction(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/apply-extraction`);
}

export function resetMedicalUpload(claimId: number): Promise<ClaimOut> {
  return api.post<ClaimOut>(`/doctor/claims/${claimId}/reset-medical-upload`);
}

/** Review-output fields after PDF extraction completes (task_no scoped). */
export interface ReviewFieldValue {
  value: string | null;
  status: string;
  confidence: number;
  validation_error?: string | null;
  page?: number | null;
  source_page?: number | null;
  bbox?: number[] | null;
  source_text?: string | null;
  raw_label?: string | null;
  /** Present when status is ambiguous / conflict (forward-compatible). */
  candidates?: Array<string | { value?: string | null }> | null;
}

export interface ExtractionReviewOutput {
  task_id?: string;
  display_fields: Record<string, ReviewFieldValue>;
  standard_fields?: Record<string, ReviewFieldValue>;
  field_labels?: Record<string, string> | null;
  template_specific_field_codes?: string[];
  is_confirmed?: boolean;
}

export function getExtractionReviewOutput(taskNo: string): Promise<ExtractionReviewOutput> {
  return api.get<ExtractionReviewOutput>(
    `/doctor/extraction-tasks/${encodeURIComponent(taskNo)}/review-output`,
  );
}

/** Persist doctor edits into extraction review-output (edited_fields). */
export function saveExtractionReviewOutput(
  taskNo: string,
  values: Record<string, string | null>,
): Promise<{ task_id: string; status: string; review: ExtractionReviewOutput }> {
  return api.put(`/doctor/extraction-tasks/${encodeURIComponent(taskNo)}/review-output`, {
    fields: Object.fromEntries(
      Object.entries(values).map(([code, value]) => [code, { value }]),
    ),
  });
}

export interface TemplateSpecificAiField {
  field_code: string;
  field_name: string;
  ai_extraction_hint?: string | null;
}

export function listTemplateSpecificAiFields(
  claimId: number,
): Promise<TemplateSpecificAiField[]> {
  return api.get<TemplateSpecificAiField[]>(
    `/doctor/claims/${claimId}/template-specific-ai-fields`,
  );
}
