import type { ClaimListItem } from "@acuity/types";
import { toClaimStatus } from "@/components/ui/status-badge";

// The resume pointer (matrix 3.2): each claim resumes at the exact step its
// status implies — a DRAFT has no extraction yet (intake, which re-seeds any
// saved record text), AI_FILLED resumes at review, CONFIRMED/PRINTED re-open
// the produced form. Never a blanket link to review. Paths are locale-free;
// the shared navigation Link carries the active locale.

export function resumeHref(claim: Pick<ClaimListItem, "id" | "status">): string {
  switch (toClaimStatus(claim.status)) {
    case "DRAFT":
      return `/forms/${claim.id}/intake`;
    case "AI_FILLED":
      return `/forms/${claim.id}/medical-review`;
    case "CONFIRMED":
    case "PRINTED":
      return `/forms/${claim.id}/produce`;
    default:
      return "/history";
  }
}

/** Whether a claim is still mid-loop (not yet printed / completed). */
export function isInProgress(status: string): boolean {
  return toClaimStatus(status) !== "PRINTED";
}
