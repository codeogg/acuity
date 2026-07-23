"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "@acuity/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  XIcon,
} from "@acuity/ui";
import { PageContainer, PageHeading } from "@/components/ui/page";
import { LOOP_STEP_TOTAL, LoopSteps, type LoopStep } from "./loop-steps";

// Shared chrome of the loop screens: step indicator, "New form · step N of 4"
// eyebrow + serif heading, persistent ghost "Leave form", sticky footer.

export function LoopScaffold({
  step,
  heading,
  headingHidden,
  footerStart,
  footerEnd,
  confirmLeave = true,
  children,
  wide,
}: {
  step: LoopStep;
  /** Serif page heading; the eyebrow renders "New form · step N of 4". */
  heading?: string;
  /** Render the heading for screen readers only (review's dense layout). */
  headingHidden?: boolean;
  /** Left side of the sticky footer (status/summary text). */
  footerStart?: ReactNode;
  /** Right side of the sticky footer (the primary action set). */
  footerEnd?: ReactNode;
  /** Ask before leaving (drafts are saved; pure-wait screens may skip). */
  confirmLeave?: boolean;
  /** Let the content own full width (review's dual pane). */
  wide?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("loop");
  const router = useRouter();
  const [leaveOpen, setLeaveOpen] = useState(false);

  function leave() {
    router.push("/");
  }

  const hasFooter = footerStart || footerEnd;

  return (
    <div className={wide ? "flex min-h-dvh flex-col lg:h-dvh" : "flex min-h-dvh flex-col"}>
      <PageContainer className={wide ? "flex min-h-0 flex-1 flex-col pb-0" : "pb-0"}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <LoopSteps current={step} />
          </div>
          {/* The persistent ghost leave affordance (reference main.jsx). */}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-muted-foreground"
            onClick={() => (confirmLeave ? setLeaveOpen(true) : leave())}
          >
            <XIcon size={16} aria-hidden />
            {t("leave-form")}
          </Button>
        </div>

        {heading &&
          (headingHidden ? (
            <h1 className="sr-only">{heading}</h1>
          ) : (
            <PageHeading
              eyebrow={t("step-eyebrow", { step: step + 1, total: LOOP_STEP_TOTAL })}
              title={heading}
            />
          ))}

        {children}
      </PageContainer>

      {hasFooter && (
        <div className="sticky bottom-0 z-10 mt-auto border-t border-border bg-card">
          {/* flex-wrap: at small widths the action set alone can exceed the
              viewport, so the meta line and actions stack instead of
              overflowing sideways. */}
          <div className="mx-auto flex w-full max-w-[var(--container-max)] flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3.5 md:px-8 lg:px-12">
            <div className="min-w-0 flex-1 text-sm text-muted-foreground">{footerStart}</div>
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2.5">{footerEnd}</div>
          </div>
        </div>
      )}

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leave-confirm-title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("leave-confirm-body")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("leave-cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={leave}>{t("leave-confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
