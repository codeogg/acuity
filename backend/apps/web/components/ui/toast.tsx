"use client";

import { useEffect, useState } from "react";

export type ToastVariant = "success" | "error" | "info";

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  duration?: number;
  onDismiss?: () => void;
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success:
    "border-[var(--color-success)] bg-[var(--color-success-soft)] text-[var(--color-success)]",
  error:
    "border-[var(--color-destructive)] bg-[var(--color-danger-soft)] text-[var(--color-destructive)]",
  info: "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)]",
};

export function Toast({
  message,
  variant = "info",
  duration = 2000,
  onDismiss,
}: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setVisible(false);
      onDismiss?.();
    }, duration);
    return () => window.clearTimeout(timer);
  }, [duration, onDismiss]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div
        className={`flex items-center gap-2 rounded-lg border px-5 py-3 text-sm font-medium shadow-lg ${VARIANT_STYLES[variant]}`}
      >
        {variant === "success" && <span>✓</span>}
        {variant === "error" && <span>✕</span>}
        {message}
      </div>
    </div>
  );
}
