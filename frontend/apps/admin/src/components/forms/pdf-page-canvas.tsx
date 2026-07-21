"use client";

// Renders one PDF page into a canvas that fills its parent. Field overlays are
// layered by the caller (percentage coords in PDF points). Uses pdfjs-dist the
// same way as the legacy annotate PdfCanvas.

import { useEffect, useRef, useState } from "react";

export function resolveTemplatePdfUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/local-storage/")) return url;
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    // MinIO paths look like /{bucket}/{key...}; strip the bucket prefix.
    if (segments.length >= 2) return `/local-storage/${segments.slice(1).join("/")}`;
  } catch {
    /* non-absolute URL */
  }
  return url;
}

export function PdfPageCanvas({
  pdfUrl,
  pageNo,
  widthPx,
  className,
}: {
  pdfUrl: string;
  pageNo: number;
  /** Target CSS pixel width of the rendered page. */
  widthPx: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!pdfUrl || widthPx <= 0) return;
      setLoading(true);
      setError(null);
      try {
        const pdfjs = await import("pdfjs-dist");
        // Served from /public — avoids Next.js ESM `import.meta.url` worker resolution.
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument(pdfUrl).promise;
        const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
        const base = page.getViewport({ scale: 1 });
        const scale = widthPx / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "PDF render failed");
          setLoading(false);
        }
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl, pageNo, widthPx]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={className ?? "absolute inset-0 h-full w-full"}
        aria-hidden
      />
      {loading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-xs text-muted-foreground">
          …
        </div>
      ) : null}
      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background px-4 text-center text-xs text-destructive">
          {error}
        </div>
      ) : null}
    </>
  );
}
