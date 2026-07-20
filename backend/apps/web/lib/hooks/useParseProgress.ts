import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/client";
import type { ParseProgress, ParseStatus } from "@/lib/api/types";

const TERMINAL_STATUSES: ParseStatus[] = [
  "AUTO_PARSED",
  "AI_ASSISTED",
  "ANNOTATED",
  "PUBLISHED",
  "PARSE_FAILED",
];

export function isParseActive(status: ParseStatus): boolean {
  return status === "PENDING" || status === "PARSING";
}

export function useParseProgress(templateId: number, enabled: boolean) {
  return useQuery({
    queryKey: ["parse-progress", templateId],
    queryFn: () =>
      apiFetch<ParseProgress>(`/api/admin/templates/${templateId}/parse-progress`),
    enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && TERMINAL_STATUSES.includes(status as ParseStatus)) {
        return false;
      }
      return enabled ? 1500 : false;
    },
  });
}
