"use client";

// Action button — runs a server action with a pending arc and a brief green
// success state (LD4/LD8 tiny in-place wait + success-loading), then toasts
// and refreshes the server-rendered view. Geometry is fixed across states.

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, Loader } from "@acuity/ui";
import { AcuityIcon, type AcuityIconName } from "@acuity/ui";
import { useToast } from "@acuity/ui";
import type { ActionResult } from "@/lib/actions";

export function ActionButton({
  label,
  icon,
  variant = "outline",
  size = "sm",
  action,
  successMessage,
  className,
  disabled,
  onDone,
}: {
  label: string;
  icon?: AcuityIconName;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive";
  size?: "sm" | "default" | "lg";
  action: () => Promise<ActionResult<unknown>>;
  successMessage: string;
  className?: string;
  disabled?: boolean;
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [succeeded, setSucceeded] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();

  function runAction() {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        setSucceeded(true);
        showToast(successMessage);
        router.refresh();
        setTimeout(() => setSucceeded(false), 1500);
        onDone?.();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  const glyph: ReactNode = pending ? (
    <Loader size="sm" aria-hidden />
  ) : succeeded ? (
    <AcuityIcon name="check" size={16} />
  ) : icon ? (
    <AcuityIcon name={icon} size={16} />
  ) : null;

  return (
    <Button
      type="button"
      variant={succeeded ? "default" : variant}
      size={size}
      onClick={runAction}
      disabled={disabled || pending}
      className={`${succeeded ? "bg-success text-success-foreground hover:bg-success" : ""} ${className ?? ""}`}
    >
      {glyph}
      {label}
    </Button>
  );
}
