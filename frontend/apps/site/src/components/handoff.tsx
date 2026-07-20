"use client";

import { cn } from "@/lib/cn";

import {
  useEffect,
  useRef,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Button, WhatsAppIcon } from "@acuity/ui";
import {
  ArrowChip,
  marketingButtonSizeClass,
  type MarketingButtonSize,
} from "@/components/marketing";
import type { HandoffKind } from "@/lib/channels";

// The calm off-site hand-off moment (reference site.js handoff()): clicking a
// WhatsApp / demo / email link shows a short reassurance toast, then opens the
// channel in a new tab after a beat. One toast element serves the whole page;
// links publish through a tiny module store.

type HandoffEvent = { kind: HandoffKind; seq: number };

let seq = 0;
const listeners = new Set<(event: HandoffEvent) => void>();

function publishHandoff(kind: HandoffKind) {
  seq += 1;
  const event: HandoffEvent = { kind, seq };
  listeners.forEach((listener) => listener(event));
}

const OPEN_DELAY_MS = 320;
const TOAST_MS = 4200;

function triggerHandoff(kind: HandoffKind, href: string) {
  publishHandoff(kind);
  window.setTimeout(() => {
    window.open(href, "_blank", "noopener");
  }, OPEN_DELAY_MS);
}

/** Mounted once in the locale layout. role=status, navy ground, auto-hides. */
export function HandoffToast() {
  const t = useTranslations("handoff");
  const [event, setEvent] = useState<HandoffEvent | null>(null);
  const [on, setOn] = useState(false);
  const hideTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const listener = (next: HandoffEvent) => {
      setEvent(next);
      // let the message mount before sliding on
      requestAnimationFrame(() => setOn(true));
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setOn(false), TOAST_MS);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none fixed bottom-8 left-1/2 z-(--z-handoff) flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-md bg-navy px-6 py-4 text-sm text-on-navy shadow-md transition-[opacity,transform] duration-200",
        on ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
      )}
    >
      <WhatsAppIcon className="size-5 flex-none" />
      <span>{event ? t(event.kind) : null}</span>
    </div>
  );
}

type HandoffLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  kind: HandoffKind;
  href: string;
  children?: ReactNode;
};

/** An anchor that routes through the hand-off toast before opening off-site. */
export function HandoffLink({ kind, href, onClick, children, ...rest }: HandoffLinkProps) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        triggerHandoff(kind, href);
      }}
    >
      {children}
    </a>
  );
}

// The primary WhatsApp CTA — a monochrome service glyph + label + the animated
// arrow chip. Filled navy on the page ground, cream on-fill inside coloured
// panels, sky-blue on the boxed hero ground. Routes through the hand-off toast.
export function WhatsAppButton({
  href,
  children,
  size = "lg",
  onFill,
  onBox,
}: {
  href: string;
  children: ReactNode;
  size?: MarketingButtonSize;
  onFill?: boolean;
  onBox?: boolean;
}) {
  return (
    <Button
      asChild
      className={cn(
        marketingButtonSizeClass(size, { chip: true }),
        onBox
          ? "bg-sky-blue text-navy hover:bg-cream"
          : onFill
            ? "bg-cream text-navy hover:bg-white"
            : "bg-navy text-on-navy hover:bg-navy-bright",
      )}
    >
      <HandoffLink kind="whatsapp" href={href}>
        <WhatsAppIcon className="size-4" />
        <span className="btn-label">{children}</span>
        <ArrowChip tone={onBox || onFill ? "navy" : "sky"} />
      </HandoffLink>
    </Button>
  );
}

// A tiered button-styled hand-off anchor (contact channel cards, compliance
// mail CTAs) — shared Button geometry + the marketing tier colours.
export function HandoffButton({
  kind,
  href,
  children,
  tier,
  size = "md",
  className,
}: {
  kind: HandoffKind;
  href: string;
  children: ReactNode;
  tier: "primary" | "secondary" | "ghost";
  size?: MarketingButtonSize;
  className?: string;
}) {
  const tierClass =
    tier === "primary"
      ? undefined
      : tier === "secondary"
        ? // Venice fill (matches SecondaryButton): cream on glaucous is 3.9:1,
          // failing AA for the label.
          "bg-venice text-on-navy hover:bg-venice-deep"
        : "text-navy hover:border-border-strong hover:bg-accent hover:text-navy";
  return (
    <Button
      asChild
      variant={tier === "secondary" ? "secondary" : tier === "ghost" ? "outline" : "default"}
      className={cn(marketingButtonSizeClass(size), tierClass, className)}
    >
      <HandoffLink kind={kind} href={href}>
        <span className="btn-label">{children}</span>
      </HandoffLink>
    </Button>
  );
}
