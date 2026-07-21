"use client";

// Renders one PDF page into a canvas that fills its parent. Field overlays are
// layered by the caller (percentage coords in PDF points). Uses pdfjs-dist the
// same way as the legacy annotate PdfCanvas.
//
// The PDFDocumentProxy is cached per URL; width/page changes only re-render.
// Width updates from ResizeObserver are debounced so tiny resizes do not
// thrash getDocument / render.

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

type PdfjsModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
type RenderTask = ReturnType<
  Awaited<ReturnType<PdfDocument["getPage"]>>["render"]
>;

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
  const docRef = useRef<PdfDocument | null>(null);
  const docUrlRef = useRef<string | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stableWidth, setStableWidth] = useState(widthPx);

  useEffect(() => {
    if (widthPx <= 0) return;
    const id = window.setTimeout(() => setStableWidth(widthPx), 120);
    return () => window.clearTimeout(id);
  }, [widthPx]);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!pdfUrl || stableWidth <= 0) return;
      setLoading(true);
      setError(null);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        let doc = docRef.current;
        if (!doc || docUrlRef.current !== pdfUrl) {
          if (doc) {
            try {
              await doc.destroy();
            } catch {
              /* ignore */
            }
            docRef.current = null;
            docUrlRef.current = null;
          }
          doc = await pdfjs.getDocument(pdfUrl).promise;
          if (cancelled) {
            try {
              await doc.destroy();
            } catch {
              /* ignore */
            }
            return;
          }
          docRef.current = doc;
          docUrlRef.current = pdfUrl;
        }

        const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        const scale = stableWidth / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        renderTaskRef.current?.cancel();
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) setLoading(false);
      } catch (err) {
        const name = err && typeof err === "object" && "name" in err ? String(err.name) : "";
        if (name === "RenderingCancelledException" || cancelled) return;
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "PDF render failed");
          setLoading(false);
        }
      } finally {
        if (!cancelled) renderTaskRef.current = null;
      }
    }

    void render();
    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [pdfUrl, pageNo, stableWidth]);

  useEffect(() => {
    return () => {
      renderTaskRef.current?.cancel();
      const doc = docRef.current;
      docRef.current = null;
      docUrlRef.current = null;
      if (doc) void doc.destroy().catch(() => undefined);
    };
  }, []);

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
