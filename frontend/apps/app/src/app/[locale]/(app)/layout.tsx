import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/session";
import { ToastProvider } from "@acuity/ui";
import { AuthGuard } from "@/components/providers/auth-guard";
import { MobileTopBar } from "@/components/shell/app-shell";
import { SystemOverlayShell } from "@/components/system/system-overlays";
import { ScenarioSwitcher } from "@/components/system/scenario-switcher";

// The signed-in route group: every surface here sits behind the session guard
// (page-level validation on top of the middleware's cookie-presence gate) and
// inside the app chrome — shell, system overlays, toasts, and the mock-mode
// scenario switcher. The (auth) group renders the sign-in journey without any
// of this chrome.
export default async function AppGroupLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  return (
    <AuthGuard locale={locale}>
      <ToastProvider>
        <SessionProvider>
          <MobileTopBar />
          <SystemOverlayShell>{children}</SystemOverlayShell>
          <ScenarioSwitcher />
        </SessionProvider>
      </ToastProvider>
    </AuthGuard>
  );
}
