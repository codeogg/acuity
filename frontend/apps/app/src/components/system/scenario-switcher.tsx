"use client";

import { useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { cn, SettingsIcon, XIcon } from "@acuity/ui";
import { frontendOnly } from "@acuity/api-client";
import {
  DEFAULT_SCENARIO,
  getMockScenario,
  resetMockScenario,
  setMockScenario,
  subscribeMockScenario,
  type MockScenario,
} from "@acuity/api-client/mocks/scenario";
import {
  getDemoControls,
  setDemoControls,
  subscribeDemoControls,
} from "./demo-controls";
import { notifySupportAccessChanged } from "./system-overlays";

// The demo scenario switcher — the mock-mode counterpart of the reference
// tweaks panel. Drives the package scenario engine (latency, failures,
// conflict, tenant-404, AI degrade, session expiry, empty data) plus the
// app-level overlay demos (impersonation, idle lock, support notice,
// self-verification hold), so every state in the matrix is reachable in a
// normal demo run. Rendered only while API mocking is enabled.

const MOCKING_ENABLED =
  (process.env.NEXT_PUBLIC_API_MOCKING ?? "enabled") === "enabled";

type ImpersonationChoice = "off" | "view-as" | "act-as";

export function ScenarioSwitcher() {
  const t = useTranslations("demo");
  const [open, setOpen] = useState(false);
  const [impersonation, setImpersonation] = useState<ImpersonationChoice>("off");
  const scenario = useSyncExternalStore(
    subscribeMockScenario,
    getMockScenario,
    getMockScenario,
  );
  const demo = useSyncExternalStore(subscribeDemoControls, getDemoControls, getDemoControls);

  if (!MOCKING_ENABLED) return null;

  async function applyImpersonation(next: ImpersonationChoice) {
    setImpersonation(next);
    try {
      const state = await frontendOnly.supportAccess.getSupportAccess();
      for (const grant of state.grants.filter((g) => g.status === "active")) {
        await frontendOnly.supportAccess.revokeSupportAccess(grant.id);
      }
      if (next !== "off") {
        await frontendOnly.supportAccess.grantSupportAccess({ mode: next });
      }
    } catch {
      /* mock boundary */
    }
    notifySupportAccessChanged();
  }

  function toggle(key: keyof MockScenario, value: boolean) {
    setMockScenario({ [key]: value } as Partial<MockScenario>);
  }

  const toggles: { key: keyof MockScenario; label: string }[] = [
    { key: "conflict", label: t("conflict") },
    { key: "tenantNotFound", label: t("tenant-not-found") },
    { key: "aiDegrade", label: t("ai-degrade") },
    { key: "sessionExpired", label: t("session-expired") },
    { key: "emptyData", label: t("empty-data") },
  ];

  return (
    <div className="fixed bottom-24 right-4 z-(--z-dev-chrome) flex flex-col items-end gap-2 print:hidden">
      {open && (
        <div
          data-testid="scenario-switcher"
          className="w-72 rounded-md border border-border bg-card p-4 shadow-lg"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="t-eyebrow text-muted-foreground">
              {t("heading")}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t("close")}
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon size={14} />
            </button>
          </div>

          <fieldset className="mb-3">
            <legend className="mb-1.5 text-xs font-medium text-foreground">
              {t("latency")}
            </legend>
            <div className="flex flex-wrap gap-1">
              {(["none", "fast", "slow", "very-slow"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scenario.latency === value}
                  onClick={() => setMockScenario({ latency: value })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors duration-[120ms]",
                    scenario.latency === value
                      ? "border-primary bg-muted text-primary"
                      : "border-border text-foreground hover:bg-accent",
                  )}
                >
                  {t(`latency-${value}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-3">
            <legend className="mb-1.5 text-xs font-medium text-foreground">
              {t("failure")}
            </legend>
            <div className="flex flex-wrap gap-1">
              {(["none", "server-error", "network-error"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scenario.failure === value}
                  onClick={() => setMockScenario({ failure: value })}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors duration-[120ms]",
                    scenario.failure === value
                      ? "border-primary bg-muted text-primary"
                      : "border-border text-foreground hover:bg-accent",
                  )}
                >
                  {t(`failure-${value}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-3 space-y-1.5">
            <legend className="mb-1.5 text-xs font-medium text-foreground">
              {t("outcomes")}
            </legend>
            {toggles.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-xs text-foreground">
                <input
                  type="checkbox"
                  checked={Boolean(scenario[key])}
                  onChange={(e) => toggle(key, e.target.checked)}
                  className="size-4 accent-[var(--color-navy)]"
                />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset className="mb-3">
            <legend className="mb-1.5 text-xs font-medium text-foreground">
              {t("impersonation")}
            </legend>
            <div className="flex flex-wrap gap-1">
              {(["off", "view-as", "act-as"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={impersonation === value}
                  onClick={() => void applyImpersonation(value)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors duration-[120ms]",
                    impersonation === value
                      ? "border-primary bg-muted text-primary"
                      : "border-border text-foreground hover:bg-accent",
                  )}
                >
                  {t(`impersonation-${value}`)}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-xs font-medium text-foreground">
              {t("overlays")}
            </legend>
            <button
              type="button"
              onClick={() => setDemoControls({ lockNow: true })}
              className="block w-full rounded-md border border-border px-2.5 py-1.5 text-left text-xs text-foreground transition-colors duration-[120ms] hover:bg-accent"
            >
              {t("lock-now")}
            </button>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={demo.showSupportNotice}
                onChange={(e) => setDemoControls({ showSupportNotice: e.target.checked })}
                className="size-4 accent-[var(--color-navy)]"
              />
              {t("support-notice")}
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground">
              <input
                type="checkbox"
                checked={demo.selfVerificationBlock}
                onChange={(e) =>
                  setDemoControls({ selfVerificationBlock: e.target.checked })
                }
                className="size-4 accent-[var(--color-navy)]"
              />
              {t("self-verification")}
            </label>
          </fieldset>

          <button
            type="button"
            onClick={() => {
              resetMockScenario();
              setMockScenario(DEFAULT_SCENARIO);
              setDemoControls({
                lockNow: false,
                showSupportNotice: false,
                selfVerificationBlock: false,
              });
              void applyImpersonation("off");
            }}
            className="mt-3 w-full rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors duration-[120ms] hover:bg-accent"
          >
            {t("reset")}
          </button>
        </div>
      )}

      <button
        type="button"
        data-testid="scenario-switcher-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-xs font-medium text-muted-foreground shadow-sm transition-colors duration-[120ms] hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <SettingsIcon size={14} aria-hidden />
        {t("toggle")}
      </button>
    </div>
  );
}
