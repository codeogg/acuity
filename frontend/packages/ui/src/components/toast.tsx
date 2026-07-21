"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertIcon, CheckIcon } from "../icons";

// The one confirmation toast: a single bottom-centred transient message,
// auto-dismissing after 2600ms — the quiet acknowledgement for completed
// actions ("saved", "signed out", "… · logged"). Two tones: success (the
// default) and error for a failed background action; substantive errors
// render inline per the voice of states, never as a toast. Surface follows
// the overlay grammar (card ground, hairline border, overlay elevation).
// Labels arrive localised from the caller.

export type ToastTone = "success" | "error";

interface ToastState {
  showToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: ToastTone } | null>(
    null,
  );
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = "success") => {
    setToast({ message, tone });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const value = useMemo<ToastState>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-(--z-toast) flex w-max max-w-[min(28rem,calc(100vw-3rem))] -translate-x-1/2 items-center gap-2.5 rounded-md border border-border bg-card px-4 py-3 shadow-[var(--elevation-overlay)]"
          style={{
            width: "min(calc(100vw - 2rem), 28rem)",
            maxWidth: "calc(100vw - 2rem)",
          }}
        >
          <span
            className={
              toast.tone === "error"
                ? "flex shrink-0 text-destructive"
                : "flex shrink-0 text-success"
            }
          >
            {toast.tone === "error" ? (
              <AlertIcon size={18} aria-hidden />
            ) : (
              <CheckIcon size={18} aria-hidden />
            )}
          </span>
          <span className="min-w-0 whitespace-nowrap flex-1 break-words text-sm text-foreground">
            {toast.message}
          </span>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast requires a <ToastProvider>");
  return ctx;
}
