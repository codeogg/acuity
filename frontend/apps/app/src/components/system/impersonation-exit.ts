"use client";

import { authEndpoints, doctorImpersonation } from "@acuity/api-client";

const MOCK_SESSION_COOKIE = "acuity_mock_session";

function clearLocalSessionMarkers() {
  // httpOnly access_token is cleared by impersonation-exit response.
  // Also drop the mock-mode presence marker if present.
  document.cookie = `${MOCK_SESSION_COOKIE}=; Path=/; Max-Age=0`;
}

/**
 * Exit order (design 5.4):
 * 1) end session on server (+ clear access_token cookie in response)
 * 2) clear any local markers
 * 3) window.close(); if still open after delay → ended page
 */
export async function exitImpersonationAndCloseTab(locale: string): Promise<void> {
  try {
    await doctorImpersonation.exitImpersonation();
  } catch {
    try {
      await authEndpoints.logout();
    } catch {
      /* ignore */
    }
  }
  clearLocalSessionMarkers();

  window.close();
  await new Promise((r) => window.setTimeout(r, 100));
  if (!window.closed) {
    window.location.replace(`/${locale}/impersonation-ended`);
  }
}
