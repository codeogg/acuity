// Coverage registry — the single source rendered into the home chip grid, the
// insurers index cards, and the per-insurer pages, so the site can never show
// coverage in one place it contradicts in another. Insurer names are proper
// nouns (never translated); form labels carry an en / zh pair for the locale.
//
// This mirrors the doctor app's canonical form-selection registry in shape; in
// production it would be read from the shared @acuity/types contract. Kept as a
// typed module so a mismatch surfaces at build time.

export type CoverageStatus = "launch" | "roadmap";

export type FormLabel = { en: string; zh: string };

export type Insurer = {
  name: string;
  slug?: string;
  status: CoverageStatus;
  forms: FormLabel[];
};

const PRE_AUTH: FormLabel = { en: "Pre-authorisation", zh: "預先批核" };
const OUTPATIENT: FormLabel = { en: "Outpatient claim", zh: "門診索償" };
const HOSPITALISATION: FormLabel = { en: "Hospitalisation claim", zh: "住院索償" };
const MEDICAL: FormLabel = { en: "Medical claim", zh: "醫療索償" };
const SURGICAL_PRE_AUTH: FormLabel = { en: "Surgical pre-auth", zh: "手術預先批核" };

export const INSURERS: readonly Insurer[] = [
  { name: "Bupa", slug: "bupa", status: "launch", forms: [PRE_AUTH, OUTPATIENT, HOSPITALISATION] },
  { name: "AIA", status: "launch", forms: [PRE_AUTH, MEDICAL] },
  { name: "Cigna", status: "launch", forms: [OUTPATIENT, HOSPITALISATION] },
  { name: "Prudential", status: "launch", forms: [MEDICAL, PRE_AUTH] },
  { name: "AXA", status: "launch", forms: [OUTPATIENT, SURGICAL_PRE_AUTH] },
  { name: "Manulife", status: "launch", forms: [MEDICAL] },
  { name: "BOC Life", status: "launch", forms: [HOSPITALISATION] },
  { name: "FWD", status: "roadmap", forms: [MEDICAL] },
  { name: "Sun Life", status: "roadmap", forms: [OUTPATIENT] },
  { name: "Blue Cross", status: "roadmap", forms: [MEDICAL] },
  { name: "Chubb", status: "roadmap", forms: [PRE_AUTH] },
  { name: "China Life", status: "roadmap", forms: [HOSPITALISATION] },
] as const;

export function insurersByStatus(status: CoverageStatus): Insurer[] {
  return INSURERS.filter((i) => i.status === status);
}

/**
 * Build-time coverage guard: a page claiming coverage must hold a registry
 * grant. Throws during prerender when the named insurer is missing or not at
 * the claimed status, so the site build fails instead of shipping an
 * overstated coverage claim (coverage honesty as CI, never editorial
 * vigilance).
 */
export function requireCoverage(name: string, status: CoverageStatus): Insurer {
  const entry = INSURERS.find((i) => i.name === name);
  if (!entry || entry.status !== status) {
    throw new Error(
      `Coverage claim not granted by the registry: ${name} (${status}). ` +
        "Update lib/insurers.ts before claiming coverage on a page.",
    );
  }
  return entry;
}
