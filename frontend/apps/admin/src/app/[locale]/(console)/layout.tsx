import type { ReactNode } from "react";
import { ConsoleShell } from "@/components/shell/console-shell";
import { SessionWatch } from "@/components/system/session-watch";

// Authenticated console group: the operator shell around every destination,
// plus the client-side session watch. The middleware gate is presence-only
// (cookie check before any protected route renders); SessionWatch validates
// the session beyond presence and routes an expired session back to sign-in
// with the deep-link return seam (?reason=expired&from=<path>).
export default async function ConsoleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <>
      <SessionWatch locale={locale} />
      <ConsoleShell locale={locale}>{children}</ConsoleShell>
    </>
  );
}
