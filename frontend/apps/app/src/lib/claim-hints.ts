"use client";

import { useEffect, useState } from "react";
import { claims, frontendOnly } from "@acuity/api-client";
import {
  deriveFieldStatus,
  getTemplateFieldSchema,
} from "@acuity/api-client/mocks/fixtures";

// Honest per-claim resume hints (matrix 4.1.3): counts derived from the real
// field schema + current values of each in-progress claim — never a canned
// number. Fetched per card (the in-progress set is small by nature).

export interface ResumeHint {
  needsInput: number;
  drafted: number;
}

export function useResumeHints(claimIds: number[]): Record<number, ResumeHint> {
  const [hints, setHints] = useState<Record<number, ResumeHint>>({});
  const key = claimIds.join(",");

  useEffect(() => {
    if (claimIds.length === 0) return;
    let cancelled = false;
    void Promise.all(
      claimIds.map(async (id) => {
        try {
          const claim = await claims.getClaim(id);
          const schema = getTemplateFieldSchema(claim.template_id);
          const values = (claim.final_field_values ?? {}) as Record<string, string>;
          let needsInput = 0;
          let drafted = 0;
          for (const field of schema.fields) {
            const status = deriveFieldStatus(field, values[field.field_code] ?? "", false);
            if (status === "needs-input") needsInput += 1;
            else if (status === "drafted") drafted += 1;
          }
          return [id, { needsInput, drafted }] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) return;
      const next: Record<number, ResumeHint> = {};
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1];
      }
      setHints(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key encodes claimIds
  }, [key]);

  return hints;
}

export type StaffHandoff = Awaited<
  ReturnType<typeof frontendOnly.staffHandoff.listHandoffs>
>[number];

/** Pending staff hand-offs (the needs-your-sign-off set). */
export function usePendingHandoffs(): {
  handoffs: StaffHandoff[];
  refetch: () => void;
} {
  const [handoffs, setHandoffs] = useState<StaffHandoff[]>([]);
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    let cancelled = false;
    frontendOnly.staffHandoff
      .listHandoffs()
      .then((all) => {
        if (!cancelled) setHandoffs(all.filter((h) => h.status === "pending"));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [epoch]);
  return { handoffs, refetch: () => setEpoch((e) => e + 1) };
}

/** The pending hand-off attached to one claim (review's hand-off mode). */
export function useClaimHandoff(claimId: number): {
  handoff: StaffHandoff | null;
  accept: () => Promise<void>;
} {
  const [handoff, setHandoff] = useState<StaffHandoff | null>(null);
  useEffect(() => {
    let cancelled = false;
    frontendOnly.staffHandoff
      .listHandoffs()
      .then((all) => {
        if (!cancelled) {
          setHandoff(
            all.find((h) => h.claim_id === claimId && h.status === "pending") ?? null,
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [claimId]);
  return {
    handoff,
    accept: async () => {
      if (!handoff) return;
      try {
        await frontendOnly.staffHandoff.acceptHandoff(handoff.id);
      } catch {
        /* the sign-off proceeds regardless */
      }
    },
  };
}
