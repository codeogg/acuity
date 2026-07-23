"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@acuity/i18n/navigation";
import { frontendOnly } from "@acuity/api-client";
import { signOut } from "@acuity/auth-ui";
import {
  Button,
  HelpIcon,
  Input,
  SignOutIcon,
  UploadIcon,
  XIcon,
  cn,
} from "@acuity/ui";
import type { Locale } from "@/i18n/routing";
import { useSession } from "@/lib/session";
import { relativeFromNow } from "@/lib/clock";
import { PageContainer, PageHeading } from "@/components/ui/page";
import { CardListSkeleton } from "@/components/ui/loaders";
import { useToast } from "@acuity/ui";

// Account and settings (ACCOUNT -> Preferences). Server-backed via the
// doctor-settings op: the signature image (uploaded once, applied to every
// produced form), default language, security (idle-lock 2–30 driving the real
// idle-lock overlay, trusted devices with remove), sign out, and help.

function SettingsCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card p-5">
      <h2 className="mb-4 font-title text-lg font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function Settings() {
  const t = useTranslations("settings");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const { settings, updateSettings } = useSession();
  const { showToast } = useToast();

  const [idleDraft, setIdleDraft] = useState<number | null>(null);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const idleLock = idleDraft ?? settings?.idle_lock_minutes ?? 10;
  const idleLockValid = idleLock >= 2 && idleLock <= 30;

  async function persist(
    body: Parameters<typeof frontendOnly.doctorSettings.updateDoctorSettings>[0],
  ) {
    try {
      const next = await frontendOnly.doctorSettings.updateDoctorSettings(body);
      updateSettings(next);
      showToast(t("saved"));
    } catch {
      showToast(t("save-failed"));
    }
  }

  async function handleSignature(file: File) {
    setSignatureUploading(true);
    try {
      const next = await frontendOnly.doctorSettings.uploadDoctorSignature(file, file.name);
      updateSettings(next);
      showToast(t("signature-uploaded"));
    } catch {
      showToast(t("signature-upload-failed"));
    } finally {
      setSignatureUploading(false);
    }
  }

  function handleIdleChange(value: number) {
    setIdleDraft(value);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (value >= 2 && value <= 30) {
      idleTimerRef.current = setTimeout(() => {
        void persist({ idle_lock_minutes: value });
      }, 600);
    }
  }

  function switchLanguage(next: Locale) {
    if (next === locale) return;
    void persist({ language: next });
    router.replace(pathname, { locale: next });
  }

  async function handleSignOut() {
    // The shared adapter sign-out: POSTs /api/auth/logout, clears the mock
    // session marker, and lands on the sign-in page.
    await signOut({ locale, signInPath: "/sign-in" });
  }

  if (!settings) {
    return (
      <PageContainer>
        <PageHeading eyebrow={t("eyebrow")} title={t("heading")} />
        <CardListSkeleton count={3} label={t("loading")} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeading eyebrow={t("eyebrow")} title={t("heading")} />

      <div className="max-w-192 space-y-6">
        {/* Signature */}
        <SettingsCard title={t("signature-heading")}>
          {settings.signature_image_url ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-44 items-center justify-center overflow-hidden rounded-md border border-border bg-background p-2">
                  {/* Stored signature is a /local-storage proxy URL, not an optimisable asset. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={settings.signature_image_url}
                    alt={t("signature-current")}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <p className="max-w-52 text-sm text-muted-foreground">
                  {t("signature-hint")}
                </p>
              </div>
              <label
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors duration-[120ms] hover:bg-accent",
                  signatureUploading && "pointer-events-none opacity-60",
                )}
              >
                <UploadIcon size={18} aria-hidden />
                {signatureUploading ? t("signature-uploading") : t("signature-replace")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={signatureUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void handleSignature(file);
                  }}
                />
              </label>
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-[var(--color-border-strong)] px-6 py-7 text-center">
              <p className="mb-3.5 text-sm text-muted-foreground">{t("signature-empty")}</p>
              <label
                className={cn(
                  "inline-flex h-11 cursor-pointer items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors duration-[120ms] hover:bg-[var(--color-action-bg-hover)]",
                  signatureUploading && "pointer-events-none opacity-60",
                )}
              >
                <UploadIcon size={18} aria-hidden />
                {signatureUploading ? t("signature-uploading") : t("signature-upload")}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={signatureUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void handleSignature(file);
                  }}
                />
              </label>
            </div>
          )}
        </SettingsCard>

        {/* Language */}
        <SettingsCard title={t("language-heading")}>
          <label
            htmlFor="default-language"
            className="mb-1 block text-sm font-medium text-foreground"
          >
            {t("language-label")}
          </label>
          <p className="mb-2 text-xs text-muted-foreground">{t("language-hint")}</p>
          <select
            id="default-language"
            value={locale}
            onChange={(e) => switchLanguage(e.target.value as Locale)}
            className="h-11 w-full max-w-80 rounded-md border border-border bg-background px-3 text-base text-foreground transition-colors duration-[120ms] focus-visible:border-[var(--color-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            <option value="en-HK">{t("language-english")}</option>
            <option value="zh-Hant-HK">{t("language-chinese")}</option>
          </select>
        </SettingsCard>

        {/* Security */}
        <SettingsCard title={t("security-heading")}>
          <div className="space-y-5">
            <div>
              <label
                htmlFor="idle-lock"
                className="mb-1 block text-sm font-medium text-foreground"
              >
                {t("idle-lock-label")}
              </label>
              <div className="flex items-center gap-3">
                <Input
                  id="idle-lock"
                  type="number"
                  min={2}
                  max={30}
                  value={idleLock}
                  onChange={(e) => handleIdleChange(Number(e.target.value))}
                  className={cn(
                    "h-11 w-24 text-base",
                    !idleLockValid && "border-[var(--state-needs-input)]",
                  )}
                />
                <span className="text-sm text-muted-foreground">
                  {t("idle-lock-unit", { min: idleLock })}
                </span>
              </div>
              {idleLockValid ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("idle-lock-helper", { min: idleLock })}
                </p>
              ) : (
                <p className="mt-1 text-xs text-destructive">
                  {t("idle-lock-out-of-range")}
                </p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">
                {t("trusted-devices-label")}
              </p>
              <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-background">
                {settings.trusted_devices.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    {t("trusted-devices-empty")}
                  </p>
                ) : (
                  settings.trusted_devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between gap-3 px-4 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{device.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t("trusted-device-seen", {
                            when: relativeFromNow(device.last_seen_at, locale),
                          })}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void persist({ remove_device_ids: [device.id] })}
                        className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors duration-[120ms] hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <XIcon size={13} aria-hidden />
                        {t("trusted-device-remove")}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Button variant="outline" onClick={handleSignOut}>
              <SignOutIcon size={18} aria-hidden />
              {t("sign-out")}
            </Button>
          </div>
        </SettingsCard>

        {/* Help */}
        <SettingsCard title={t("help-heading")}>
          <p className="mb-4 text-sm text-muted-foreground">{t("help-body")}</p>
          <Button variant="secondary" onClick={() => showToast(t("help-sent"))}>
            <HelpIcon size={18} aria-hidden />
            {t("help-contact")}
          </Button>
        </SettingsCard>
      </div>
    </PageContainer>
  );
}
