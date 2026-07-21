"use client";

// PDF page canvas with field overlays + draw-to-create (ported from
// backend/apps/web annotator PdfCanvas). Coordinates are PDF points,
// top-left origin, stored at 100% scale.

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@acuity/ui";
import type { TemplateFieldOut } from "@acuity/types";
import { FIELD_STATUS_BORDER, fieldDisplayStatus } from "@/components/forms/field-status";
import { resolveTemplatePdfUrl } from "@/components/forms/pdf-page-canvas";

export interface NewBox {
  pageNo: number;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
}

const MIN_BOX_PT = 5;

function clampBox(x: number, y: number, w: number, h: number, pageW: number, pageH: number) {
  let pos_x = x;
  let pos_y = y;
  let width = w;
  let height = h;
  if (pos_x < 0) {
    width += pos_x;
    pos_x = 0;
  }
  if (pos_y < 0) {
    height += pos_y;
    pos_y = 0;
  }
  if (pos_x + width > pageW) width = pageW - pos_x;
  if (pos_y + height > pageH) height = pageH - pos_y;
  return { pos_x, pos_y, width, height };
}

export function PdfAnnotatorCanvas({
  pdfUrl,
  pageNo,
  pageCount,
  fields,
  selectedId,
  drawMode,
  onDrawModeChange,
  continuousDraw,
  onContinuousDrawChange,
  onSelect,
  onCreateBox,
  onCreateTooSmall,
  onPageChange,
}: {
  pdfUrl: string;
  pageNo: number;
  pageCount: number;
  fields: TemplateFieldOut[];
  selectedId: number | null;
  drawMode: boolean;
  onDrawModeChange: (active: boolean) => void;
  continuousDraw: boolean;
  onContinuousDrawChange: (active: boolean) => void;
  onSelect: (id: number) => void;
  onCreateBox: (box: NewBox) => void;
  onCreateTooSmall: () => void;
  onPageChange: (page: number) => void;
}) {
  const t = useTranslations("editor.annotate");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1.25);
  const [renderScale, setRenderScale] = useState(1.25);
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });
  const [rendering, setRendering] = useState(true);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [dragRect, setDragRect] = useState<null | { x: number; y: number; w: number; h: number }>(null);

  const resolvedUrl = resolveTemplatePdfUrl(pdfUrl);

  const fitToWidth = useCallback(() => {
    const container = containerRef.current;
    if (!container || !pageSize.width) return;
    const available = container.clientWidth - 16;
    setScale(Math.min(3, Math.max(0.5, available / pageSize.width)));
  }, [pageSize.width]);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      if (!resolvedUrl) return;
      setRendering(true);
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument(resolvedUrl).promise;
        const page = await doc.getPage(Math.min(Math.max(1, pageNo), doc.numPages));
        const viewport = page.getViewport({ scale });
        const baseViewport = page.getViewport({ scale: 1 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setPageSize({ width: baseViewport.width, height: baseViewport.height });
        setRenderScale(canvas.width / baseViewport.width);
        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setRendering(false);
      } catch {
        if (!cancelled) setRendering(false);
      }
    }
    void render();
    return () => {
      cancelled = true;
    };
  }, [resolvedUrl, pageNo, scale]);

  const cancelDrag = useCallback(() => {
    drag.current = null;
    setDragRect(null);
  }, []);

  useEffect(() => {
    if (!drawMode) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (drag.current) cancelDrag();
      else onDrawModeChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawMode, onDrawModeChange, cancelDrag]);

  useEffect(() => {
    if (!drawMode) cancelDrag();
  }, [drawMode, cancelDrag]);

  const pageFields = fields.filter((f) => f.page_no === pageNo);

  function toScreen(f: { pos_x: number; pos_y: number; width: number; height: number }) {
    const actualScale = renderScale || scale;
    return {
      left: f.pos_x * actualScale,
      top: f.pos_y * actualScale,
      width: f.width * actualScale,
      height: f.height * actualScale,
    };
  }

  function finishDrag(cx: number, cy: number) {
    if (!drag.current) return;
    const actualScale = renderScale || scale;
    const raw = {
      x: Math.min(drag.current.x, cx),
      y: Math.min(drag.current.y, cy),
      w: Math.abs(cx - drag.current.x),
      h: Math.abs(cy - drag.current.y),
    };
    drag.current = null;
    setDragRect(null);
    if (raw.w < 1 || raw.h < 1) return;

    const unclamped = {
      pos_x: raw.x / actualScale,
      pos_y: raw.y / actualScale,
      width: raw.w / actualScale,
      height: raw.h / actualScale,
    };
    const box = clampBox(
      unclamped.pos_x,
      unclamped.pos_y,
      unclamped.width,
      unclamped.height,
      pageSize.width,
      pageSize.height,
    );
    if (box.width < MIN_BOX_PT || box.height < MIN_BOX_PT) {
      onCreateTooSmall();
      return;
    }
    onCreateBox({
      pageNo,
      pos_x: Math.round(box.pos_x * 100) / 100,
      pos_y: Math.round(box.pos_y * 100) / 100,
      width: Math.round(box.width * 100) / 100,
      height: Math.round(box.height * 100) / 100,
    });
  }

  function onOverlayPointerDown(e: React.PointerEvent) {
    if (!drawMode || e.target !== overlayRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = overlayRef.current!.getBoundingClientRect();
    drag.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onOverlayPointerMove(e: React.PointerEvent) {
    if (!drawMode || !drag.current) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    setDragRect({
      x: Math.min(drag.current.x, cx),
      y: Math.min(drag.current.y, cy),
      w: Math.abs(cx - drag.current.x),
      h: Math.abs(cy - drag.current.y),
    });
  }

  function onOverlayPointerUp(e: React.PointerEvent) {
    if (!drawMode || !drag.current) return;
    const rect = overlayRef.current!.getBoundingClientRect();
    finishDrag(e.clientX - rect.left, e.clientY - rect.top);
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        <Button
          type="button"
          variant={drawMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            cancelDrag();
            onDrawModeChange(!drawMode);
          }}
        >
          {drawMode ? t("drawing") : t("add-field")}
        </Button>
        {drawMode ? (
          <>
            <label className="flex cursor-pointer items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                className="size-3.5 rounded border-border"
                checked={continuousDraw}
                onChange={(e) => onContinuousDrawChange(e.target.checked)}
              />
              {t("continuous-add")}
            </label>
            <Button type="button" variant="outline" size="sm" onClick={() => onDrawModeChange(false)}>
              {t("done")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("draw-hint")}</span>
          </>
        ) : null}
        <div className="mx-1 h-4 w-px bg-border" />
        <Button type="button" variant="outline" size="sm" disabled={pageNo <= 1} onClick={() => onPageChange(pageNo - 1)}>
          ‹
        </Button>
        <span className="text-sm text-foreground">{t("page-of", { page: pageNo, total: pageCount })}</span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pageNo >= pageCount}
          onClick={() => onPageChange(pageNo + 1)}
        >
          ›
        </Button>
        <div className="mx-1 h-4 w-px bg-border" />
        <Button type="button" variant="outline" size="sm" onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}>
          −
        </Button>
        <span className="min-w-12 text-center text-sm tabular-nums text-foreground">
          {Math.round((renderScale || scale) * 100)}%
        </span>
        <Button type="button" variant="outline" size="sm" onClick={() => setScale((s) => Math.min(3, s + 0.25))}>
          +
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={fitToWidth}>
          {t("fit-width")}
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="relative inline-block rounded-sm border border-border bg-background shadow-sm">
          <canvas ref={canvasRef} className="block" />
          <div
            ref={overlayRef}
            className={`absolute inset-0 ${drawMode ? "cursor-crosshair" : "pointer-events-none"}`}
            onPointerDown={onOverlayPointerDown}
            onPointerMove={onOverlayPointerMove}
            onPointerUp={onOverlayPointerUp}
          >
            {pageFields.map((f) => {
              const s = toScreen(f);
              const selected = f.id === selectedId;
              const status = fieldDisplayStatus(f);
              return (
                <div
                  key={f.id}
                  onPointerDown={(e) => {
                    if (drawMode) return;
                    e.stopPropagation();
                    onSelect(f.id);
                  }}
                  className={`absolute border-2 transition-opacity ${
                    drawMode ? "pointer-events-none opacity-40" : "pointer-events-auto cursor-pointer"
                  } ${
                    selected
                      ? "border-primary bg-primary/20 ring-2 ring-primary/30"
                      : FIELD_STATUS_BORDER[status]
                  }`}
                  style={{ left: s.left, top: s.top, width: s.width, height: s.height }}
                >
                  <span className="absolute -top-5 left-0 max-w-full truncate text-[10px] font-medium text-foreground">
                    {f.field_label_raw ?? f.pdf_field_name ?? `#${f.id}`}
                  </span>
                </div>
              );
            })}
            {dragRect ? (
              <div
                className="pointer-events-none absolute border-2 border-dashed border-primary bg-primary/10"
                style={{ left: dragRect.x, top: dragRect.y, width: dragRect.w, height: dragRect.h }}
              />
            ) : null}
          </div>
          {rendering ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
              {t("rendering")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
