// Package-local bilingual catalogs (en-HK + zh-Hant-HK, full key parity —
// enforced by scripts/check-i18n.mjs). The journey renders from these through
// its own NextIntlClientProvider, so it works — including the in-place
// language toggle — without the consuming app having to carry auth strings.
// Apps that also reference auth copy outside the journey (metadata, emails)
// merge these into their own message loader; see the package README.

import type { Locale } from "@acuity/i18n";
import enHK from "../messages/en-HK.json";
import zhHantHK from "../messages/zh-Hant-HK.json";

export type AuthUiMessages = typeof enHK;

const catalogs: Record<Locale, AuthUiMessages> = {
  "en-HK": enHK,
  "zh-Hant-HK": zhHantHK as AuthUiMessages,
};

// The single top-level namespace the catalogs occupy when merged into an
// app catalog ({ ...appMessages, ...authUiMessages(locale) }).
export const AUTH_UI_NAMESPACE = "auth";

export function authUiMessages(locale: Locale): AuthUiMessages {
  return catalogs[locale];
}
