// Per-claim intake-source memory (import filename vs paste), so the review's
// "Drafted from" line is honest about where the record came from. Session-
// scoped browser state: no contract drift, nothing persisted beyond the demo
// session. Falls back to "paste" when unset.

export interface IntakeSource {
  kind: "import" | "paste";
  filename?: string;
}

const KEY = (claimId: number) => `acuity:intake-source:${claimId}`;

export function rememberIntakeSource(claimId: number, source: IntakeSource): void {
  try {
    sessionStorage.setItem(KEY(claimId), JSON.stringify(source));
  } catch {
    /* storage unavailable — the review falls back to the paste variant */
  }
}

export function recallIntakeSource(claimId: number): IntakeSource | null {
  try {
    const raw = sessionStorage.getItem(KEY(claimId));
    return raw ? (JSON.parse(raw) as IntakeSource) : null;
  } catch {
    return null;
  }
}
