import { apiFetch } from "@/lib/api/client";
import type { Claim } from "@/lib/api/types";
import type { PipelinePhase } from "@/lib/extraction/pipeline";

export interface ClaimMedicalPdfUploadOutput {
  extraction_task_id: number;
  extraction_task_no: string;
  original_filename: string;
  patient_name: string | null;
}

export type ExtractProgressStage =
  | "IDLE" | "INGEST" | "CLASSIFY" | "EXTRACT" | "VALIDATE"
  | "DONE" | "FAILED" | "AWAITING_INPUT";

export type ExtractProgressStatus =
  | "IDLE" | "QUEUED" | "RUNNING" | "AWAITING_INPUT" | "DONE" | "FAILED";

export type ExtractProgress = {
  stage: ExtractProgressStage;
  percent: number;
  message: string | null;
  status: ExtractProgressStatus;
  visits?: Array<{
    visit_index: number;
    visit_date: string | null;
    summary: string | null;
    page_range: number[];
    selected: boolean;
  }> | null;
};

export function extractStageToPhase(stage: ExtractProgressStage): PipelinePhase {
  switch (stage) {
    case "INGEST": return "preprocessing";
    case "CLASSIFY": return "classifying";
    case "EXTRACT": return "extracting";
    case "VALIDATE": return "finalizing";
    case "AWAITING_INPUT": return "visit_select";
    case "DONE": return "review";
    case "FAILED": return "failed";
    default: return "uploaded";
  }
}

export async function fetchClaimExtractProgress(claimId: number) {
  return apiFetch<ExtractProgress>(`/api/doctor/claims/${claimId}/extract-progress`);
}

export async function startClaimExtractFromPdf(claimId: number) {
  return apiFetch<{ job_id: string | null; status: string; message: string }>(
    `/api/doctor/claims/${claimId}/extract-from-pdf`,
    { method: "POST" },
  );
}

export async function cancelClaimExtraction(claimId: number) {
  return apiFetch<Claim>(`/api/doctor/claims/${claimId}/cancel-extraction`, {
    method: "POST",
  });
}

export async function resumeClaimExtraction(claimId: number, visitIndex: number) {
  return apiFetch<{ job_id: string | null; status: string; message: string }>(
    `/api/doctor/claims/${claimId}/resume-extraction`,
    { method: "POST", body: { visit_index: visitIndex } },
  );
}

export async function uploadClaimMedicalPdf(
  claimId: number,
  file: File,
  patientName?: string,
) {
  const fd = new FormData();
  fd.append("file", file);
  if (patientName?.trim()) fd.append("patient_name", patientName.trim());
  return apiFetch<ClaimMedicalPdfUploadOutput>(
    `/api/doctor/claims/${claimId}/medical-pdf`,
    { method: "POST", formData: fd },
  );
}

export async function applyClaimExtraction(claimId: number) {
  return apiFetch<Claim>(`/api/doctor/claims/${claimId}/apply-extraction`, { method: "POST" });
}

export async function resetClaimMedicalUpload(claimId: number) {
  return apiFetch<Claim>(`/api/doctor/claims/${claimId}/reset-medical-upload`, { method: "POST" });
}
