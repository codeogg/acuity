"use client";

/*
 * Sign-out wiring — the correct POST-based action both consuming shells
 * adopt: the adapter's logout() POSTs /api/auth/logout (never a GET link),
 * the mock session marker is cleared, and the visitor lands back on the
 * sign-in page with a full reload (client state dropped by design).
 */

import type { ComponentProps } from "react";
import { Button } from "@acuity/ui";
import { auth } from "@acuity/api-client";
import { MOCK_SESSION_COOKIE } from "../mount/config";

export interface SignOutOptions {
  // Active locale segment (e.g. "en-HK").
  locale: string;
  // Locale-relative sign-in path of this app.
  signInPath: string;
}

export async function signOut(options: SignOutOptions): Promise<void> {
  try {
    await auth.logout();
  } catch {
    // Sign-out is best-effort server-side; the local session always ends.
  }
  if (typeof document !== "undefined") {
    document.cookie = `${MOCK_SESSION_COOKIE}=; path=/; Max-Age=0`;
  }
  if (typeof window !== "undefined") {
    window.location.assign(`/${options.locale}${options.signInPath}`);
  }
}

export function SignOutButton({
  locale,
  signInPath,
  children,
  ...rest
}: SignOutOptions & ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => void signOut({ locale, signInPath })}
      {...rest}
    >
      {children}
    </Button>
  );
}
