"use client";

// Console sign-out — the shared auth-ui POST-based sign-out (adapter logout,
// marker clear, land on sign-in), styled as the shell's account row. Sets the
// signed-out marker first so the middleware's mock-first boot session does
// not re-admit the visitor: after signing out, every console route gates to
// sign-in until re-authentication.

import { signOut } from "@acuity/auth-ui";
import { AcuityIcon } from "@acuity/ui";

const SIGNED_OUT_COOKIE = "acuity_signed_out";

export function consoleSignOut(locale: string): void {
  document.cookie = `${SIGNED_OUT_COOKIE}=1; path=/; SameSite=Lax`;
  void signOut({ locale, signInPath: "/sign-in" });
}

export function SignOutRow({ locale, label }: { locale: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => consoleSignOut(locale)}
      className="group relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-foreground transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
    >
      <span className="flex shrink-0 text-muted-foreground">
        <AcuityIcon name="sign-out" size={18} />
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
