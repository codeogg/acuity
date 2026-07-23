// Doctor account settings — signature image, language, idle-lock threshold,
// trusted devices, default delivery. GET/PUT /doctor/settings and multipart
// signature upload are backed by the live FastAPI doctor_settings module.

import type { DoctorSettings, DoctorSettingsUpdate, TrustedDevice } from "@acuity/types";
import { api } from "../../client";

export type { DoctorSettings, DoctorSettingsUpdate, TrustedDevice };

export function getDoctorSettings(): Promise<DoctorSettings> {
  return api.get<DoctorSettings>("/doctor/settings");
}

export function updateDoctorSettings(body: DoctorSettingsUpdate): Promise<DoctorSettings> {
  return api.put<DoctorSettings>("/doctor/settings", body);
}

/** Multipart upload to MinIO (via storage.upload_bytes); returns updated settings. */
export function uploadDoctorSignature(
  file: File | Blob,
  filename?: string,
): Promise<DoctorSettings> {
  const form = new FormData();
  form.append("file", file, filename ?? (file instanceof File ? file.name : "signature.png"));
  return api.postForm<DoctorSettings>("/doctor/settings/signature", form);
}
