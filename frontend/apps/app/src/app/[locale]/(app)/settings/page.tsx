import { setRequestLocale } from "next-intl/server";
import { Settings } from "./settings";

// ACCOUNT -> Preferences: account and settings.
export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Settings />;
}
