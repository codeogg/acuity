import { apiFetch } from "@/lib/api/client";
import type { Claim } from "@/lib/api/types";

export interface GeneratePdfResponse {
  pdf_url: string;
  generated_at: string;
}

export async function generateClaimPdf(claimId: number) {
  return apiFetch<GeneratePdfResponse>(
    `/api/doctor/claims/${claimId}/generate-pdf`,
    { method: "POST" },
  );
}

export function claimPdfPreviewUrl(claimId: number, cacheKey?: string | number) {
  const base = `/api/doctor/claims/${claimId}/pdf`;
  if (cacheKey == null || cacheKey === "") return base;
  return `${base}?v=${encodeURIComponent(String(cacheKey))}`;
}

export async function revertClaimToReview(claimId: number) {
  return apiFetch<Claim>(`/api/doctor/claims/${claimId}/revert-to-review`, {
    method: "POST",
  });
}

export async function markClaimPrinted(claimId: number) {
  return apiFetch<Claim>(`/api/doctor/claims/${claimId}/mark-printed`, {
    method: "POST",
  });
}
