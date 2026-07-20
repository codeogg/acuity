// frontend-only: pending backend
//
// Doctor account settings — signature image, language, idle-lock threshold,
// trusted devices, default delivery. The settings surface persists these; the
// produce step consumes the signature image.

import type { DoctorSettings, DoctorSettingsUpdate, TrustedDevice } from "@acuity/types";
import { api } from "../../client";

export type { DoctorSettings, DoctorSettingsUpdate, TrustedDevice };

export function getDoctorSettings(): Promise<DoctorSettings> {
  return api.get<DoctorSettings>("/doctor/settings");
}

export function updateDoctorSettings(body: DoctorSettingsUpdate): Promise<DoctorSettings> {
  return api.put<DoctorSettings>("/doctor/settings", body);
}
