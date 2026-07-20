import type { ClaimStatus } from "@acuity/types";
import {
  AlertIcon,
  CheckCircleIcon,
  CheckIcon,
  DashIcon,
  FieldStateDot,
  PencilIcon,
  StatusBadge,
  XIcon,
  type FieldState,
  type StatusTone,
} from "@acuity/ui";

// App-side domain mapping over the shared status system (@acuity/ui
// StatusBadge / FieldStateDot): claim statuses -> tones + glyphs, field states
// -> the four-status grammar. Presentation (colour + icon + text, never colour
// alone) lives in the shared components; only the mapping is app code.

const CLAIM_STATUSES: ClaimStatus[] = [
  "DRAFT",
  "AI_FILLED",
  "CONFIRMED",
  "PRINTED",
  "CANCELLED",
];

export function toClaimStatus(value: string): ClaimStatus {
  return (CLAIM_STATUSES as string[]).includes(value)
    ? (value as ClaimStatus)
    : "DRAFT";
}

const CLAIM_TONE: Record<ClaimStatus, { tone: StatusTone; icon: React.ReactNode }> = {
  DRAFT: { tone: "info", icon: <PencilIcon size={13} /> },
  AI_FILLED: { tone: "warning", icon: <AlertIcon size={13} /> },
  CONFIRMED: { tone: "success", icon: <CheckIcon size={13} /> },
  PRINTED: { tone: "success", icon: <CheckCircleIcon size={13} /> },
  CANCELLED: { tone: "neutral", icon: <XIcon size={13} /> },
};

export function ClaimStatusBadge({
  status,
  label,
  className,
}: {
  status: ClaimStatus;
  label: string;
  className?: string;
}) {
  const map = CLAIM_TONE[status];
  return (
    <StatusBadge
      tone={map.tone}
      icon={map.icon}
      label={label}
      appearance="outline"
      className={className}
    />
  );
}

export type FieldStatus = FieldState;

const FIELD_ICON: Record<FieldState, React.ReactNode> = {
  optional: <DashIcon size={13} />,
  "needs-input": <AlertIcon size={13} />,
  drafted: <PencilIcon size={13} />,
  confirmed: <CheckIcon size={13} />,
};

export function FieldStatusDot({
  status,
  label,
  className,
}: {
  status: FieldState;
  label: string;
  className?: string;
}) {
  return (
    <FieldStateDot
      state={status}
      icon={FIELD_ICON[status]}
      label={label}
      className={className}
    />
  );
}
