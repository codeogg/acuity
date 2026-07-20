"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { Button, ShieldIcon } from "@acuity/ui";
import { frontendOnly } from "@acuity/api-client";
import { useSession } from "@/lib/session";
import { useAppSessionGuard } from "@/components/providers/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { ImpersonationBar } from "./impersonation-bar";
import { IdleLock } from "./idle-lock";
import { SupportAccessDialog } from "./support-access-dialog";
import {
  getDemoControls,
  setDemoControls,
  subscribeDemoControls,
} from "./demo-controls";

type SupportAccessState = Awaited<
  ReturnType<typeof frontendOnly.supportAccess.getSupportAccess>
>;

const SUPPORT_ACCESS_CHANGED = "acuity:support-access-changed";
const SESSION_EXPIRED = "acuity:session-expired";

/** Ask the overlay layer to re-read support-access state (switcher grants). */
export function notifySupportAccessChanged(): void {
  window.dispatchEvent(new CustomEvent(SUPPORT_ACCESS_CHANGED));
}

// The cross-cutting overlay layer (system-overlays.md) wrapping the shell:
//   - the persistent non-dismissable impersonation bar (banner slot, above the
//     shell, fail-safe on the resolved grant state);
//   - the idle-lock scrim after the settings-configured threshold;
//   - the proactive support-access notice;
//   - the session-expired overlay (the 401 boundary, owned by the auth group;
//     mocked here so the journey is demo-reachable).

export function SystemOverlayShell({ children }: { children: ReactNode }) {
  const t = useTranslations("system");
  const { settings } = useSession();
  const guard = useAppSessionGuard();
  const demo = useSyncExternalStore(subscribeDemoControls, getDemoControls, getDemoControls);

  const [support, setSupport] = useState<SupportAccessState | null>(null);
  const [idleLocked, setIdleLocked] = useState(false);
  const [supportAcked, setSupportAcked] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // --- support-access / impersonation state --------------------------------
  const loadSupport = useCallback(() => {
    frontendOnly.supportAccess
      .getSupportAccess()
      .then(setSupport)
      .catch(() => {
        // Fail-safe, not fail-open: an unresolved flag keeps the last state.
      });
  }, []);

  useEffect(() => {
    loadSupport();
    const onChanged = () => loadSupport();
    window.addEventListener(SUPPORT_ACCESS_CHANGED, onChanged);
    return () => window.removeEventListener(SUPPORT_ACCESS_CHANGED, onChanged);
  }, [loadSupport]);

  const activeGrant = support?.grants.find((g) => g.status === "active");
  const impersonationMode = support?.active && activeGrant ? activeGrant.mode : null;

  // --- idle lock -------------------------------------------------------------
  const idleMinutes = settings?.idle_lock_minutes ?? 10;
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const arm = () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(
        () => setIdleLocked(true),
        idleMinutes * 60_000,
      );
    };
    const events = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const name of events) window.addEventListener(name, arm, { passive: true });
    arm();
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      for (const name of events) window.removeEventListener(name, arm);
    };
  }, [idleMinutes]);

  useEffect(() => {
    if (demo.lockNow) {
      setIdleLocked(true);
      setDemoControls({ lockNow: false });
    }
  }, [demo.lockNow]);

  // --- session expiry ---------------------------------------------------------
  useEffect(() => {
    const onExpired = () => setSessionExpired(true);
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, []);

  // --- support-access notice ---------------------------------------------------
  const pastGrant = support?.grants.find(
    (g) => g.status === "expired" || g.status === "revoked",
  );
  const showSupportNotice = demo.showSupportNotice && !supportAcked;

  return (
    <>
      <AppShell
        banner={impersonationMode ? <ImpersonationBar mode={impersonationMode} /> : undefined}
      >
        {children}
      </AppShell>

      {idleLocked && <IdleLock onUnlock={() => setIdleLocked(false)} />}

      {showSupportNotice && (
        <SupportAccessDialog
          accessedAt={pastGrant?.started_at ?? new Date().toISOString()}
          onAck={() => {
            setSupportAcked(true);
            setDemoControls({ showSupportNotice: false });
          }}
        />
      )}

      {sessionExpired && (
        <div className="fixed inset-0 z-(--z-overlay-raised) flex items-center justify-center bg-background/95 backdrop-blur-sm">
          <div className="max-w-96 px-6 text-center">
            <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full border border-border bg-muted">
              <ShieldIcon size={26} className="text-primary" aria-hidden />
            </div>
            <h2 className="font-title text-2xl font-semibold text-foreground">
              {t("session-expired-title")}
            </h2>
            <p className="mt-2.5 text-base text-muted-foreground">
              {t("session-expired-body")}
            </p>
            <Button
              className="mt-6"
              onClick={() => {
                // The 401 handling path: re-run the session guard, which
                // redirects to sign-in preserving this page as the deep-link
                // return target.
                if (guard) guard.recheck();
                else window.location.reload();
              }}
            >
              {t("session-expired-action")}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
