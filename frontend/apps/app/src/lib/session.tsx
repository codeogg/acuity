"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  authEndpoints,
  claims,
  frontendOnly,
  type MeResponseExtended,
} from "@acuity/api-client";
import type { MeResponse } from "@acuity/types";

// Settings shape from the frontend-only doctor-settings op (typed via the
// namespace so no deep import path is needed).
export type DoctorSettings = Awaited<
  ReturnType<typeof frontendOnly.doctorSettings.getDoctorSettings>
>;

// The signed-in identity + doctor settings, fetched once per app mount from
// /auth/me and /doctor/settings (never hardcoded). Identity drives the sidebar
// block and the work-home greeting; settings drive the idle-lock threshold and
// the signature applied at produce.

export interface SessionState {
  me: MeResponse | null;
  clinicName: string | null;
  // ADR 0041 §6: the session spans every linked clinic (no single clinic name).
  mergedWorkspace: boolean;
  settings: DoctorSettings | null;
  refreshSettings: () => void;
  updateSettings: (next: DoctorSettings) => void;
}

const SessionContext = createContext<SessionState>({
  me: null,
  clinicName: null,
  mergedWorkspace: false,
  settings: null,
  refreshSettings: () => {},
  updateSettings: () => {},
});

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [clinicName, setClinicName] = useState<string | null>(null);
  const [mergedWorkspace, setMergedWorkspace] = useState(false);
  const [settings, setSettings] = useState<DoctorSettings | null>(null);
  const [settingsEpoch, setSettingsEpoch] = useState(0);

  useEffect(() => {
    let cancelled = false;
    authEndpoints
      .me()
      .then((res) => {
        if (cancelled) return;
        setMe(res);
        setMergedWorkspace(
          (res as MeResponseExtended).merged_workspace === true,
        );
      })
      .catch(() => {
        // Identity stays null; surfaces render their own fallbacks. The auth
        // group owns the sign-in redirect.
      });
    // The clinic display name rides the home overview (the contract's one
    // source of the clinic label).
    claims
      .getHomeOverview()
      .then((overview) => {
        if (!cancelled && overview.clinic_name) setClinicName(overview.clinic_name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    frontendOnly.doctorSettings
      .getDoctorSettings()
      .then((res) => {
        if (!cancelled) setSettings(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [settingsEpoch]);

  return (
    <SessionContext.Provider
      value={{
        me,
        clinicName,
        mergedWorkspace,
        settings,
        refreshSettings: () => setSettingsEpoch((e) => e + 1),
        updateSettings: setSettings,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
