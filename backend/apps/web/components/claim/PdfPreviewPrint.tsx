"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { claimPdfPreviewUrl } from "@/lib/claim/pdf";
import { useI18n } from "@/lib/i18n/I18nProvider";

export function PdfPreviewPrint({
  claimId,
  submissionNo,
  cacheKey,
  onRevert,
  reverting,
  revertError,
  onComplete,
  completing,
  completeError,
  alreadyPrinted,
}: {
  claimId: number;
  submissionNo: string;
  cacheKey?: string | number;
  onRevert: () => void;
  reverting?: boolean;
  revertError?: string | null;
  onComplete: () => void;
  completing?: boolean;
  completeError?: string | null;
  /** 已是已打印状态时，「完成」仅返回，不再调接口 */
  alreadyPrinted?: boolean;
}) {
  const { t } = useI18n();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const pdfUrl = claimPdfPreviewUrl(claimId, cacheKey);
  const busy = Boolean(reverting || completing);

  const handlePrint = () => {
    const iframe = iframeRef.current;
    iframe?.contentWindow?.focus();
    iframe?.contentWindow?.print();
  };

  return (
    <div className="flex min-h-[70vh] flex-col">
      {(revertError || completeError) && (
        <div className="mb-3 rounded-md border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-destructive)]">
          {completeError ?? revertError}
        </div>
      )}
      <iframe
        key={String(cacheKey ?? claimId)}
        ref={iframeRef}
        src={pdfUrl}
        className="min-h-0 flex-1 w-full border-0"
        title={t("doctor.pdf.policyPreview")}
      />
      <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] p-3">
        <Button variant="outline" onClick={onRevert} disabled={busy || alreadyPrinted}>
          {reverting ? t("doctor.common.processing") : t("doctor.pdf.returnEdit")}
        </Button>
        <Button onClick={handlePrint} disabled={busy}>
          {t("doctor.common.print")}
        </Button>
        <a href={pdfUrl} download={`${submissionNo}.pdf`}>
          <Button variant="outline" type="button" disabled={busy}>
            {t("doctor.common.download")}
          </Button>
        </a>
        <Button className="ml-auto" onClick={onComplete} disabled={busy}>
          {completing ? t("doctor.common.processing") : t("doctor.common.complete")}
        </Button>
      </div>
    </div>
  );
}
