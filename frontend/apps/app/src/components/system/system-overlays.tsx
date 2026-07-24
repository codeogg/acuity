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
import { doctorImpersonation, frontendOnly } from "@acuity/api-client";
import { useSession } from "@/lib/session";
import { useAppSessionGuard } from "@/components/providers/auth-guard";
import { AppShell } from "@/components/shell/app-shell";
import { ImpersonationBar } from "./impersonation-bar";
import { ImpersonationBannerHost } from "./impersonation-banner-host";
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
type SupportAccessPendingItem = Awaited<
  ReturnType<typeof doctorImpersonation.listPendingSupportAccess>
>["items"][number];

const SUPPORT_ACCESS_CHANGED = "acuity:support-access-changed";
const SESSION_EXPIRED = "acuity:session-expired";

/** Ask the overlay layer to re-read support-access state (switcher grants). */
export function notifySupportAccessChanged(): void {
  window.dispatchEvent(new CustomEvent(SUPPORT_ACCESS_CHANGED));
}

export function SystemOverlayShell({ children }: { children: ReactNode }) {
  const t = useTranslations("system");
  const { settings, me, impersonation } = useSession();
  const guard = useAppSessionGuard();
  const demo = useSyncExternalStore(subscribeDemoControls, getDemoControls, getDemoControls);

  const [support, setSupport] = useState<SupportAccessState | null>(null);
  const [idleLocked, setIdleLocked] = useState(false);
  const [pendingNotices, setPendingNotices] = useState<SupportAccessPendingItem[]>(
    [],
  );
  const [demoNoticeOpen, setDemoNoticeOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const pendingFetchedFor = useRef<number | null>(null);

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

  // Design 5.6: after a real doctor login (not while impersonating), async
  // pending fetch — failure must never block the signed-in shell.
  useEffect(() => {
    if (!me || impersonation) {
      pendingFetchedFor.current = null;
      setPendingNotices([]);
      return;
    }
    if (pendingFetchedFor.current === me.user_id) return;
    pendingFetchedFor.current = me.user_id;
    let cancelled = false;
    doctorImpersonation
      .listPendingSupportAccess()
      .then((res) => {
        if (!cancelled) setPendingNotices(res.items);
      })
      .catch(() => {
        // Notification delay only; login already succeeded.
        if (!cancelled) pendingFetchedFor.current = null;
      });
    return () => {
      cancelled = true;
    };
  }, [me, impersonation]);

  useEffect(() => {
    setDemoNoticeOpen(demo.showSupportNotice);
  }, [demo.showSupportNotice]);

  // Live impersonation JWT context wins; demo grant is fallback for mock demos.
  const activeGrant = support?.grants.find((g) => g.status === "active");
  const demoMode = support?.active && activeGrant ? activeGrant.mode : null;
  const liveMode = impersonation?.mode ?? null;
  const doctorName =
    impersonation?.doctor?.trim() ||
    me?.display_name?.trim() ||
    me?.username?.trim() ||
    (impersonation ? `DR-${impersonation.doctor_id}` : "");

  let banner: ReactNode;
  if (liveMode) {
    banner = (
      <ImpersonationBannerHost mode={liveMode} doctorName={doctorName || "—"} />
    );
  } else if (demoMode) {
    banner = (
      <ImpersonationBar
        mode={demoMode === "act-as" ? "proxy" : "view"}
        doctorName={doctorName || "—"}
      />
    );
  } else {
    banner = undefined;
  }

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

  useEffect(() => {
    const onExpired = () => setSessionExpired(true);
    window.addEventListener(SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED, onExpired);
  }, []);

  const currentNotice = pendingNotices[0] ?? null;
  const pastGrant = support?.grants.find(
    (g) => g.status === "expired" || g.status === "revoked",
  );

  const ackCurrentNotice = useCallback(() => {
    const head = pendingNotices[0];
    if (!head) return;
    setPendingNotices((queue) => queue.slice(1));
    void doctorImpersonation.acknowledgeSupportAccess(head.session_id).catch(() => {
      // Ack failure: notice already dismissed locally; next login may retry
      // only if backend still has doctor_notified_at null (design filter).
    });
  }, [pendingNotices]);

  return (
    <>
      <AppShell banner={banner}>{children}</AppShell>

      {idleLocked && <IdleLock onUnlock={() => setIdleLocked(false)} />}

      {currentNotice && (
        <SupportAccessDialog
          accessedAt={currentNotice.ended_at ?? currentNotice.started_at}
          operator={currentNotice.operator}
          mode={currentNotice.mode}
          reason={currentNotice.reason}
          onAck={ackCurrentNotice}
        />
      )}

      {!currentNotice && demoNoticeOpen && (
        <SupportAccessDialog
          accessedAt={pastGrant?.started_at ?? new Date().toISOString()}
          operator={pastGrant?.operator}
          mode={
            pastGrant?.mode === "act-as" || pastGrant?.mode === "proxy"
              ? "proxy"
              : "view"
          }
          onAck={() => {
            setDemoNoticeOpen(false);
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
