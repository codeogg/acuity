"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@acuity/api-client";
import { notifySessionExpired } from "@/lib/api-error";

// A tiny data-fetching hook for the mock-first client surfaces. The MSW worker
// starts client-side (see MockBootstrap), so data-bearing surfaces fetch on the
// client. This hook models the four states every populating region must present
// (loading / error / empty / success) and exposes a typed ApiError so callers
// can branch on `error.kind` (409 conflict, 404 not-found, ...).
//
// Deliberately minimal (no cache, no TanStack Query — the foundation ships no
// query lib): each surface owns its own fetch. A `refetch` is returned for
// retry and post-mutation revalidation.

export interface ApiState<T> {
  data: T | undefined;
  loading: boolean;
  error: ApiError | undefined;
  refetch: () => void;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: readonly unknown[] = [],
): ApiState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | undefined>(undefined);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    fetcherRef
      .current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        notifySessionExpired(cause);
        if (!cancelled) {
          setError(
            cause instanceof ApiError
              ? cause
              : new ApiError({
                  kind: "unknown",
                  status: 0,
                  message: cause instanceof Error ? cause.message : "Unknown error",
                }),
          );
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [refetchCount, setRefetchCount] = useState(0);
  const refetch = useCallback(() => setRefetchCount((c) => c + 1), []);

  useEffect(() => {
    const cleanup = load();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, refetchCount, ...deps]);

  return { data, loading, error, refetch };
}
