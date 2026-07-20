"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ClaimStatusBadge } from "@/components/shared/ClaimStatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { ClaimListItem, Page } from "@/lib/api/types";
import { claimPdfPreviewUrl } from "@/lib/claim/pdf";
import { appendQueryParam, claimFlowUrl, claimsListUrl } from "@/lib/doctor/utils";
import { useI18n } from "@/lib/i18n/I18nProvider";

const DELETABLE = new Set(["DRAFT", "AI_FILLED"]);
const CANCELLABLE = new Set(["CONFIRMED", "PRINTED"]);
const PAGE_SIZE = 10;

type PendingAction =
  | { type: "delete"; claim: ClaimListItem }
  | { type: "cancel"; claim: ClaimListItem }
  | null;

export default function ClaimsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qc = useQueryClient();
  const { locale, t } = useI18n();

  const initialQ = searchParams.get("q") ?? "";
  const initialStatus = searchParams.get("status") ?? "";
  const initialPage = Math.max(1, Number(searchParams.get("page") ?? 1));

  const [searchInput, setSearchInput] = useState(initialQ);
  const [keyword, setKeyword] = useState(initialQ);
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(initialPage);
  const [pending, setPending] = useState<PendingAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const syncUrl = useCallback(
    (next: { q?: string; status?: string; page?: number }) => {
      const url = claimsListUrl({
        q: next.q ?? keyword,
        status: next.status ?? status,
        page: next.page ?? page,
      });
      router.replace(url);
    },
    [router, keyword, status, page],
  );

  useEffect(() => {
    setSearchInput(initialQ);
    setKeyword(initialQ);
    setStatus(initialStatus);
    setPage(initialPage);
  }, [initialQ, initialStatus, initialPage]);

  const listBackUrl = useMemo(
    () => claimsListUrl({ q: keyword, status, page }),
    [keyword, status, page],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["claims", keyword, status, page],
    queryFn: () =>
      apiFetch<Page<ClaimListItem>>("/api/doctor/claims", {
        query: {
          patient_name: keyword || undefined,
          status: status || undefined,
          page,
          page_size: PAGE_SIZE,
        },
      }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/doctor/claims/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setActionError(null);
      setPending(null);
      qc.invalidateQueries({ queryKey: ["claims"] });
      qc.invalidateQueries({ queryKey: ["doctor-home"] });
    },
    onError: (e) => {
      setActionError(e instanceof ApiRequestError ? e.message : t("doctor.claims.deleteFailed"));
      setPending(null);
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/api/doctor/claims/${id}/cancel`, { method: "POST" }),
    onSuccess: () => {
      setActionError(null);
      setPending(null);
      qc.invalidateQueries({ queryKey: ["claims"] });
      qc.invalidateQueries({ queryKey: ["doctor-home"] });
    },
    onError: (e) => {
      setActionError(e instanceof ApiRequestError ? e.message : t("doctor.claims.cancelFailed"));
      setPending(null);
    },
  });

  function runSearch() {
    const q = searchInput.trim();
    setKeyword(q);
    setPage(1);
    syncUrl({ q, page: 1 });
  }

  function handleStatusChange(next: string) {
    setStatus(next);
    setPage(1);
    syncUrl({ status: next, page: 1 });
  }

  function goToPage(next: number) {
    setPage(next);
    syncUrl({ page: next });
  }

  function rowHref(c: ClaimListItem): string {
    if (c.status === "DRAFT" || c.status === "AI_FILLED" || c.status === "CONFIRMED") {
      return claimFlowUrl(c.id, c.status, listBackUrl);
    }
    return appendQueryParam(`/doctor/claims/${c.id}`, "back", listBackUrl);
  }

  const acting = deleteMut.isPending || cancelMut.isPending;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{t("doctor.claims.title")}</h1>
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {t("doctor.claims.description")}
          </p>
        </div>
        <Link href="/doctor/new-claim">
          <Button>{t("doctor.home.newClaim")}</Button>
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          placeholder={t("doctor.claims.searchPlaceholder")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") runSearch();
          }}
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={runSearch}>
          {t("doctor.claims.search")}
        </Button>
        <select
          className="h-9 rounded-md border border-[var(--color-input)] bg-transparent px-3 text-sm"
          value={status}
          onChange={(e) => handleStatusChange(e.target.value)}
        >
          <option value="">{t("doctor.claims.allStatuses")}</option>
          <option value="DRAFT">{t("doctor.status.DRAFT")}</option>
          <option value="AI_FILLED">{t("doctor.status.AI_FILLED")}</option>
          <option value="CONFIRMED">{t("doctor.status.CONFIRMED")}</option>
          <option value="PRINTED">{t("doctor.status.PRINTED")}</option>
          <option value="CANCELLED">{t("doctor.status.CANCELLED")}</option>
        </select>
        {(keyword || status || page > 1) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearchInput("");
              setKeyword("");
              setStatus("");
              setPage(1);
              router.replace("/doctor/claims");
            }}
          >
            {t("doctor.claims.reset")}
          </Button>
        )}
      </div>

      {actionError && (
        <p className="mb-3 text-sm text-[var(--color-destructive)]">{actionError}</p>
      )}

      <Card className="border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(18,22,28,0.06)]">
        {isLoading ? (
          <p className="p-6 text-sm text-[var(--color-muted-foreground)]">{t("doctor.common.loading")}</p>
        ) : data?.items.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--color-muted-foreground)]">
            {t("doctor.claims.empty")}
          </p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted-foreground)]">
                <tr>
                  <th className="px-4 py-2.5">{t("doctor.claims.number")}</th>
                  <th className="px-4 py-2.5">{t("doctor.claims.patient")}</th>
                  <th className="px-4 py-2.5">{t("doctor.claims.status")}</th>
                  <th className="px-4 py-2.5">{t("doctor.claims.createdAt")}</th>
                  <th className="px-4 py-2.5 text-right">{t("doctor.claims.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((c) => (
                  <tr key={c.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums">{c.submission_no}</td>
                    <td className="px-4 py-2.5">{c.patient_name ?? "-"}</td>
                    <td className="px-4 py-2.5">
                      <ClaimStatusBadge status={c.status} />
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-muted-foreground)]">
                      {new Date(c.created_at).toLocaleString(locale)}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-2">
                        {c.status !== "CANCELLED" && (
                          <Link href={rowHref(c)}>
                            <Button variant="outline" size="sm">
                              {c.status === "DRAFT" || c.status === "AI_FILLED"
                                ? t("doctor.claims.continue")
                                : t("doctor.claims.view")}
                            </Button>
                          </Link>
                        )}
                        {c.generated_pdf_url && (
                          <a href={claimPdfPreviewUrl(c.id)} download={`${c.submission_no}.pdf`}>
                            <Button variant="outline" size="sm" type="button">
                              {t("doctor.common.download")}
                            </Button>
                          </a>
                        )}
                        {DELETABLE.has(c.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            disabled={acting}
                            onClick={() => setPending({ type: "delete", claim: c })}
                          >
                            {t("doctor.claims.delete")}
                          </Button>
                        )}
                        {CANCELLABLE.has(c.status) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]"
                            disabled={acting}
                            onClick={() => setPending({ type: "cancel", claim: c })}
                          >
                            {t("doctor.claims.cancel")}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {total > 0 && (
              <div className="flex items-center justify-between border-t border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-muted-foreground)]">
                <span>
                  {t("doctor.claims.pagination", { total, page, pages: totalPages })}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => goToPage(page - 1)}
                  >
                    {t("doctor.claims.previous")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => goToPage(page + 1)}
                  >
                    {t("doctor.claims.next")}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <ConfirmDialog
        open={pending?.type === "delete"}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        title={t("doctor.claims.confirmDeleteTitle")}
        description={
          pending?.type === "delete"
            ? t("doctor.claims.confirmDeleteDescription", { number: pending.claim.submission_no })
            : ""
        }
        confirmLabel={t("doctor.claims.confirmDelete")}
        variant="danger"
        loading={deleteMut.isPending}
        onConfirm={() => {
          if (pending?.type === "delete") deleteMut.mutate(pending.claim.id);
        }}
      />

      <ConfirmDialog
        open={pending?.type === "cancel"}
        onOpenChange={(o) => { if (!o) setPending(null); }}
        title={t("doctor.claims.confirmCancelTitle")}
        description={
          pending?.type === "cancel"
            ? t("doctor.claims.confirmCancelDescription", { number: pending.claim.submission_no })
            : ""
        }
        confirmLabel={t("doctor.claims.confirmCancel")}
        variant="default"
        loading={cancelMut.isPending}
        onConfirm={() => {
          if (pending?.type === "cancel") cancelMut.mutate(pending.claim.id);
        }}
      />
    </div>
  );
}
