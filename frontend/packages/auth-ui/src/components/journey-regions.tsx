"use client";

/*
 * Presentational pieces of the centered-card journey: the form regions
 * (identity / factor / clinic / recovery / permission / landed / loading),
 * the primary action with the green success-loading affordance, the
 * secondary links, and the viewport-anchored footer strip. All strings
 * arrive resolved; all state notes are colour + icon + text (Callout).
 */

import type { ComponentProps, ReactNode } from "react";
import {
  Button,
  Callout,
  CenteredLoading,
  CheckCircleIcon,
  CheckIcon,
  Input,
  ScanFaceIcon,
  Spinner,
  StepIndicator,
  cn,
} from "@acuity/ui";
import type { AuthNote, ClinicOption } from "../journey/types";

export const NOTE_ID = "auth-journey-note";

// Inline state note — colour + icon + text via the Callout tone set. The
// danger/warning tones announce via role="alert"; info/success via
// role="status" (design-kit Callout behaviour).
export function JourneyNote({ note, text }: { note: AuthNote; text: string }) {
  return (
    <Callout
      id={NOTE_ID}
      tone={note.kind === "error" ? "danger" : note.kind}
      className="rounded-md"
    >
      <div className="text-sm">{text}</div>
    </Callout>
  );
}

// LD8: the auth wait is never a skeleton — a centred catch-up arc + labelled
// cue, announced politely (the loading swap must not be silent to screen
// readers).
export function LoadingRegion({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite">
      <CenteredLoading className="min-h-32" variant="arc" label={label} />
    </div>
  );
}

// Quiet success confirm while the redirect handoff runs (no celebration).
export function LandedRegion({ text }: { text: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center gap-3 py-4 text-center"
    >
      <span className="text-sage">
        <CheckCircleIcon size={28} />
      </span>
      <p className="text-sm text-foreground">{text}</p>
    </div>
  );
}

// Identity credentials — email + password (ADR 0040: password is first-class;
// hosted OIDC / Google is deferred and not shown on this surface).
export function IdentityRegion({
  email,
  password,
  onEmailChange,
  onPasswordChange,
  emailLabel,
  passwordLabel,
  disabled,
}: {
  email: string;
  password: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  emailLabel: string;
  passwordLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{emailLabel}</span>
        <Input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          disabled={disabled}
          className="h-11"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{passwordLabel}</span>
        <Input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => onPasswordChange(event.target.value)}
          disabled={disabled}
          className="h-11"
        />
      </label>
    </div>
  );
}

// Doctor passkey / device confirm — a calm recessed prompt (SC 3.3.8: never a
// sole cognitive-function test). Live TOTP also accepts a 6-digit code.
export function DoctorFactorRegion({
  hint,
  code,
  onCodeChange,
  codeLabel,
}: {
  hint: string;
  code?: string;
  onCodeChange?: (value: string) => void;
  codeLabel?: string;
}) {
  return (
    <div className="flex w-full flex-col gap-3 rounded-md border border-border bg-cream-contrast p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="text-venice">
          <ScanFaceIcon size={32} />
        </span>
        <span className="text-sm text-foreground">{hint}</span>
      </div>
      {onCodeChange ? (
        <label className="flex w-full flex-col gap-1.5 text-left">
          <span className="text-sm font-medium text-foreground">{codeLabel}</span>
          <Input
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code ?? ""}
            onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
            className="h-11 w-full min-w-0 text-center font-mono text-base tracking-[0.35em]"
            placeholder="000000"
            aria-label={codeLabel}
          />
        </label>
      ) : null}
    </div>
  );
}

export function MfaEnrollRegion({
  qrDataUrl,
  secret,
  code,
  onCodeChange,
  scanLabel,
  secretLabel,
  codeLabel,
}: {
  qrDataUrl: string | null;
  secret: string;
  code: string;
  onCodeChange: (value: string) => void;
  scanLabel: string;
  secretLabel: string;
  codeLabel: string;
}) {
  return (
    <div className="flex w-full flex-col gap-4">
      <p className="text-sm text-foreground">{scanLabel}</p>
      <div className="flex w-full flex-col items-center gap-3 rounded-md border border-border bg-cream-contrast p-4">
        {qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="" className="size-44 rounded-sm bg-white p-2" />
        ) : (
          <div className="flex size-44 items-center justify-center text-xs text-muted-foreground">…</div>
        )}
        <div className="w-full min-w-0 text-left">
          <div className="mb-1 text-xs font-medium text-muted-foreground">{secretLabel}</div>
          <code className="block break-all rounded-md border border-border bg-background px-3 py-2 font-mono text-xs">
            {secret || "—"}
          </code>
        </div>
      </div>
      <label className="flex w-full flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{codeLabel}</span>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => onCodeChange(event.target.value.replace(/\D/g, "").slice(0, 6))}
          className="h-11 w-full min-w-0 text-center font-mono text-base tracking-[0.35em]"
          placeholder="000000"
          aria-label={codeLabel}
        />
      </label>
    </div>
  );
}

export function MfaBackupRegion({
  codes,
  caption,
}: {
  codes: string[];
  caption: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-foreground">{caption}</p>
      <ul className="grid grid-cols-2 gap-2 rounded-md border border-border bg-cream-contrast p-3 font-mono text-xs">
        {codes.map((code) => (
          <li key={code} className="rounded bg-background px-2 py-1.5 text-foreground">
            {code}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Operator hardware-key MFA — the LD3 determinate labelled step sequence.
export function OperatorFactorRegion({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="py-2">
      <StepIndicator
        orientation="vertical"
        current={current}
        steps={steps.map((label, index) => ({ id: `step-${index}`, label }))}
      />
    </div>
  );
}

// Clinic single-select (multi-clinic identities). Radio semantics; the
// selected option pairs a venice-blue border with a check icon + text.
export function ClinicRegion({
  clinics,
  selected,
  onSelect,
  groupLabel,
  displayName,
}: {
  clinics: ClinicOption[];
  selected: number | null;
  onSelect: (id: number) => void;
  groupLabel: string;
  displayName: (clinic: ClinicOption) => { name: string; sub: string };
}) {
  return (
    <div role="radiogroup" aria-label={groupLabel} className="flex flex-col gap-2">
      {clinics.map((clinic) => {
        const isSelected = selected === clinic.id;
        const { name, sub } = displayName(clinic);
        return (
          <button
            key={clinic.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(clinic.id)}
            className={cn(
              "flex items-center justify-between rounded-md border p-4 text-left transition-colors",
              isSelected
                ? "border-venice bg-cream-contrast"
                : "border-border hover:border-glaucous",
            )}
          >
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">{name}</span>
              <span className="text-xs text-muted-foreground">{sub}</span>
            </span>
            <span
              className={cn("text-venice", isSelected ? "opacity-100" : "opacity-0")}
              aria-hidden="true"
            >
              <CheckIcon size={20} />
            </span>
          </button>
        );
      })}
    </div>
  );
}


// Recovery — deliberate, never optimistic; the started confirmation is a calm
// info note, a failed start is visible (never swallowed).
export function RecoveryRegion({
  body,
  startedText,
  started,
}: {
  body: string;
  startedText: string;
  started: boolean;
}) {
  if (started) {
    return (
      <Callout tone="info" className="rounded-md">
        <div className="text-sm">{startedText}</div>
      </Callout>
    );
  }
  return <p className="text-base text-foreground">{body}</p>;
}

// Wrong-app session, rendered inside the card (nothing behind it exposed).
export function PermissionRegion({ text }: { text: string }) {
  return (
    <Callout tone="warning" className="rounded-md">
      <div className="text-sm">{text}</div>
    </Callout>
  );
}

// Primary action with the committed-submit green success-loading state; the
// operator key-wait stays a plain navy busy state (mid-verification, not yet
// success). Both are non-interactive while in flight (no double-submit).
export function PrimaryButton({
  label,
  busy,
  busyLabel,
  busyTone = "success",
  describedBy,
  disabled,
}: {
  label: string;
  busy: boolean;
  busyLabel?: string;
  busyTone?: "success" | "navy";
  describedBy?: string;
  disabled?: boolean;
}) {
  if (busy) {
    return (
      <Button
        type="submit"
        variant={busyTone === "navy" ? "default" : "success"}
        disabled
        aria-live="polite"
        className={cn(
          "h-11 w-full gap-2 text-base font-medium",
          busyTone === "navy" && "bg-primary text-primary-foreground",
        )}
      >
        <Spinner size={16} />
        <span>{busyLabel ?? label}</span>
      </Button>
    );
  }
  return (
    <Button
      type="submit"
      disabled={disabled}
      aria-describedby={describedBy}
      className="h-11 w-full bg-primary text-base font-medium text-primary-foreground"
    >
      {label}
    </Button>
  );
}

// Secondary text links — subordinate, venice-blue AAA, left-aligned within the
// card column (shell §Secondary links), stacking below the tablet breakpoint.
export function LinkRow({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col items-start gap-3 md:flex-row md:items-center">
      {children}
    </div>
  );
}

export function LinkDot() {
  return (
    <span aria-hidden="true" className="hidden size-1 rounded-full bg-border md:block" />
  );
}

export function LinkButton({
  children,
  onClick,
  ...rest
}: {
  children: ReactNode;
  onClick: () => void;
} & ComponentProps<"button">) {
  return (
    <button
      type="button"
      onClick={onClick}
      // -my-1 py-1: ≥24px hit box (WCAG 2.2 — standalone links, no inline
      // exemption) without moving the visual line.
      className="auth-link -my-1 inline-flex items-center gap-1.5 py-1 text-sm"
      {...rest}
    >
      {children}
    </button>
  );
}

// Footer strip — subordinate legal links anchored to the viewport bottom on
// the cream ground, outside the card (shell §Footer strip).
export function FooterStrip({
  privacyHref,
  privacyLabel,
  termsHref,
  termsLabel,
}: {
  privacyHref: string;
  privacyLabel: string;
  termsHref: string;
  termsLabel: string;
}) {
  return (
    <footer className="auth-footer text-xs">
      <a href={privacyHref} className="auth-link inline-flex items-center py-1">
        {privacyLabel}
      </a>
      <span aria-hidden="true" className="size-1 rounded-full bg-border" />
      <a href={termsHref} className="auth-link inline-flex items-center py-1">
        {termsLabel}
      </a>
    </footer>
  );
}
