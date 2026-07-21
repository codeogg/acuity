"use client";

/*
 * AuthJourney — the complete authentication journey for one surface, mounted
 * by a consuming app via createAuthPage(config). Faithful to the finalised
 * centered-card shell (doctor warm / operator hardened deltas) and wired end
 * to end over the swappable @acuity/api-client auth adapter:
 *
 *   - identity (email + password) -> optional MFA challenge/verify ->
 *     optional clinic selection -> quiet landed confirm -> REAL redirect to
 *     the destination (deep-link return target when preserved, else the
 *     surface's landing path);
 *   - session-expired re-entry (?reason=expired [&dl=|&from=]) rendering the
 *     calm info note and returning to the exact preserved path after re-auth;
 *   - per-app session isolation: a session whose role this surface does not
 *     accept is logged out and rendered as permission-denied in the card;
 *   - recovery (deliberate, never optimistic; failures visible);
 *   - every failure state demo-reachable (?demo-account= / ?demo-mfa= /
 *     ?demo-scenario=) so the running app is a complete review surface;
 *   - LD8 loading (never a skeleton) with LD6 long-wait promotion, LD3
 *     determinate steps for the hardware-key wait, green success-loading on
 *     committed submits, reduced-motion posture via styles.css;
 *   - in-place English / 中文 toggle (doctor only) that re-renders the card
 *     copy without leaving it — flow state is preserved mid-step.
 *
 * The journey renders through its own NextIntlClientProvider over the
 * package-local catalogs, so mounting needs no app-catalog merge.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, ShieldIcon, cn } from "@acuity/ui";
import {
  auth,
  frontendOnly,
  type LoginRequest,
  type LoginResponseExtended,
} from "@acuity/api-client";
import { defaultLocale, locales, type Locale } from "@acuity/i18n";
import { authUiMessages } from "../messages";
import {
  parseAuthEntry,
  resolveDestination,
  resolveErrorNote,
  roleAllowed,
  swapLocaleInPath,
  type AuthEntryParams,
} from "../journey/logic";
import type { AuthNote, AuthScreen, ClinicOption } from "../journey/types";
import { MOCK_SESSION_COOKIE, type AuthMountConfig } from "../mount/config";
import {
  ClinicRegion,
  DoctorFactorRegion,
  FooterStrip,
  JourneyNote,
  LandedRegion,
  LinkButton,
  LinkDot,
  LinkRow,
  LoadingRegion,
  NOTE_ID,
  IdentityRegion,
  OperatorFactorRegion,
  PermissionRegion,
  PrimaryButton,
  RecoveryRegion,
} from "./journey-regions";

const { authFlow } = frontendOnly;

// Felt pace of the mock flow (ms). Cosmetic — the real adapter resolves on
// its own schedule; these keep the journey legible for review.
const T = { press: 650, verify: 950, redirect: 1000 } as const;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface AuthJourneyProps {
  config: AuthMountConfig;
  locale: string;
}

export function AuthJourney({ config, locale }: AuthJourneyProps) {
  const initial = (locales as readonly string[]).includes(locale)
    ? (locale as Locale)
    : defaultLocale;
  const [displayLocale, setDisplayLocale] = useState<Locale>(initial);
  return (
    <NextIntlClientProvider
      locale={displayLocale}
      messages={authUiMessages(displayLocale)}
    >
      <JourneyCard
        config={config}
        displayLocale={displayLocale}
        onLocaleChange={setDisplayLocale}
      />
    </NextIntlClientProvider>
  );
}

interface JourneyCardProps {
  config: AuthMountConfig;
  displayLocale: Locale;
  onLocaleChange: (locale: Locale) => void;
}

function JourneyCard({ config, displayLocale, onLocaleChange }: JourneyCardProps) {
  const surface = config.surface;
  const isOperator = surface === "operator";
  const router = useRouter();
  const searchParams = useSearchParams();

  const common = useTranslations("auth.common");
  const s = useTranslations(`auth.${surface}`);

  // ---- flow state ----
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<AuthScreen>("identity");
  const [note, setNote] = useState<AuthNote | null>(null);
  const [btnBusy, setBtnBusy] = useState(false);
  const [operatorStep, setOperatorStep] = useState(0);
  const [loadingKey, setLoadingKey] = useState<"loading" | "longWait">("loading");
  const [clinics, setClinics] = useState<ClinicOption[]>([]);
  const [selectedClinic, setSelectedClinic] = useState<number | null>(null);
  const [recoveryStarted, setRecoveryStarted] = useState(false);
  const [landedReturn, setLandedReturn] = useState(false);
  // ADR 0040: email + password is the first-class first factor on this surface.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Sequence guard so a superseded async flow can't commit stale state.
  const seq = useRef(0);

  // Entry params (one-shot), mock credentials, MFA challenge, deep link.
  const didInit = useRef(false);
  const entryRef = useRef<AuthEntryParams | null>(null);
  const demoMfaRef = useRef<"fail" | "expired" | null>(null);
  const credentialsRef = useRef<Map<string, string>>(new Map());
  const totpRef = useRef<string>("");
  const challengeRef = useRef<string | undefined>(undefined);
  const deepLinkRef = useRef<string | null>(null);
  const mocksActive = config.mocks !== false;

  // ---- bootstrap: entry params, mock worker, deep-link exchange ----
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const entry = parseAuthEntry(new URLSearchParams(searchParams.toString()));
    entryRef.current = entry;
    demoMfaRef.current = entry.demoMfa;
    if (entry.reason === "expired") {
      setNote({ kind: "info", messageKey: "states.sessionExpired" });
    }
    (async () => {
      if (mocksActive) {
        try {
          const { startMockWorker } = await import(
            "@acuity/api-client/mocks/browser"
          );
          await startMockWorker();
          const scenario = await import("@acuity/api-client/mocks/scenario");
          for (const name of entry.demoScenarios) {
            if (name in scenario.SCENARIO_NAMES) {
              scenario.applyMockScenarioName(name as never);
            }
          }
          const fixtures = await import("@acuity/api-client/mocks/fixtures");
          for (const account of fixtures.authAccounts) {
            credentialsRef.current.set(account.login_account, account.password);
          }
          totpRef.current = fixtures.totpValidCode;
          // Demo prefill: the configured demo account's credentials populate
          // the visible fields, so the one-click review flow is preserved.
          // Unknown demo accounts prefill with a wrong password on purpose —
          // that is the wrong-credentials review state.
          const demoLogin =
            entry.demoAccount ?? config.demoAccount ?? null;
          if (demoLogin) {
            setEmail(demoLogin);
            setPassword(
              credentialsRef.current.get(demoLogin) ?? "demo-wrong-password",
            );
          }
        } catch {
          // A failed worker start surfaces as a network note on first call.
        }
      }
      // Preserve the deep link: a pre-issued token wins; a raw from-path is
      // exchanged for a single-use token, validated server-side against the
      // return-target allowlist (a rejected target falls back to landing).
      if (entry.deepLinkToken) {
        deepLinkRef.current = entry.deepLinkToken;
      } else if (entry.fromPath) {
        try {
          const issued = await authFlow.issueDeepLinkToken({
            return_target: entry.fromPath,
          });
          deepLinkRef.current = issued.token;
        } catch {
          deepLinkRef.current = null;
        }
      }
      setReady(true);
    })();
  }, [searchParams, mocksActive, config.demoAccount]);

  // ---- LD6: long-wait copy promotion while the loading screen shows ----
  useEffect(() => {
    if (screen !== "loading" || loadingKey === "longWait") return;
    const id = setTimeout(() => setLoadingKey("longWait"), 3500);
    return () => clearTimeout(id);
  }, [screen, loadingKey]);

  // ---- focus management: step transitions move focus into the new step ----
  const formRef = useRef<HTMLFormElement>(null);
  const prevScreen = useRef<AuthScreen>("identity");
  useEffect(() => {
    if (prevScreen.current === screen) return;
    prevScreen.current = screen;
    if (screen === "loading" || screen === "landed") return;
    const first = formRef.current?.querySelector<HTMLElement>(
      'button:not([disabled]), a[href], input, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  }, [screen]);

  // ---- flow steps -----------------------------------------------------------

  function buildCredentials(): LoginRequest {
    return { username: email.trim(), password } as LoginRequest;
  }

  // Post-first-factor (or post-MFA) continuation: separated multi-clinic
  // identities pick a clinic per session; merged ones land straight in their
  // one combined workspace (ADR 0041 §6); single-clinic identities land
  // directly (never a redundant step).
  async function proceedToClinicOrLand(alive: () => boolean) {
    const list = await authFlow.listAccountClinics();
    if (!alive()) return;
    const options: ClinicOption[] = list.items.map((clinic) => ({
      id: clinic.id,
      clinicCode: clinic.clinic_code,
      nameEn: clinic.name_en,
      nameZh: clinic.name_zh,
    }));
    const first = options[0];
    if (options.length > 1 && list.workspace_separation !== "merged" && first) {
      setClinics(options);
      setSelectedClinic(first.id);
      setScreen("clinic");
    } else {
      await land(alive);
    }
  }

  function submitIdentity() {
    const my = ++seq.current;
    const alive = () => my === seq.current;
    void (async () => {
      setNote(null);
      setBtnBusy(true);
      try {
        const response = await auth.login(buildCredentials());
        if (!alive()) return;
        // Per-app session isolation: reject a wrong-role session outright.
        if (!roleAllowed(response.role, config.allowedRoles)) {
          try {
            await auth.logout();
          } catch {
            // The rejection stands even if the logout call fails.
          }
          if (!alive()) return;
          setBtnBusy(false);
          setScreen("permission");
          return;
        }
        await delay(T.press);
        if (!alive()) return;
        setBtnBusy(false);
        setLoadingKey("loading");
        setScreen("loading");
        // ADR 0040: the second factor is OPT-IN for doctors (mfa_enabled body
        // extension, absent = false) and mandatory for operators; a demo
        // factor state (?demo-mfa=) always routes through the step-up so
        // every MFA state stays review-reachable.
        const mfaEnabled =
          (response as LoginResponseExtended).mfa_enabled === true;
        const requiresFactor =
          !config.skipMfa && (isOperator || mfaEnabled || demoMfaRef.current != null);
        if (requiresFactor) {
          try {
            const challenge = await authFlow.beginMfaChallenge();
            challengeRef.current = challenge.challenge_id;
          } catch {
            challengeRef.current = undefined;
          }
          await delay(T.redirect);
          if (!alive()) return;
          setOperatorStep(0);
          setScreen("factor");
        } else {
          await delay(T.redirect);
          if (!alive()) return;
          // The local FastAPI integration currently implements the base JWT
          // session only; its FUTURE-AUTH clinic-selection API is not present.
          // skipMfa is an explicit non-production integration escape hatch,
          // so bypass that extension group and enter the mounted surface.
          if (config.skipMfa) {
            await land(alive);
          } else {
            await proceedToClinicOrLand(alive);
          }
        }
      } catch (cause) {
        if (!alive()) return;
        setBtnBusy(false);
        const next = resolveErrorNote(cause, "identity", surface);
        if (next.messageKey === "states.permissionDenied") {
          setNote(null);
          setScreen("permission");
        } else {
          setNote(next);
          setScreen("identity");
        }
      }
    })();
  }

  // One-shot demo factor outcomes (?demo-mfa=fail|expired): consume and clear
  // so the retry succeeds — every MFA state is reachable, none is sticky.
  function consumeDemoMfa(): "fail" | "expired" | null {
    const value = demoMfaRef.current;
    demoMfaRef.current = null;
    return value;
  }

  function confirmDoctorFactor() {
    const my = ++seq.current;
    const alive = () => my === seq.current;
    void (async () => {
      const demo = consumeDemoMfa();
      if (demo === "expired") {
        // The challenge lapsed: calm reset note + a fresh challenge.
        setNote({ kind: "info", messageKey: "states.mfaExpired" });
        try {
          const challenge = await authFlow.beginMfaChallenge();
          if (alive()) challengeRef.current = challenge.challenge_id;
        } catch {
          challengeRef.current = undefined;
        }
        return;
      }
      setNote(null);
      setBtnBusy(true);
      try {
        await authFlow.verifyMfa({
          challenge_id: challengeRef.current,
          method: "totp",
          code: demo === "fail" ? "000000" : totpRef.current,
        });
        await delay(T.press);
        if (!alive()) return;
        setBtnBusy(false);
        setLoadingKey("loading");
        setScreen("loading");
        await delay(T.redirect);
        if (!alive()) return;
        await proceedToClinicOrLand(alive);
      } catch (cause) {
        if (!alive()) return;
        setBtnBusy(false);
        setNote(resolveErrorNote(cause, "factor", surface));
        setScreen("factor");
      }
    })();
  }

  function runOperatorKey() {
    const my = ++seq.current;
    const alive = () => my === seq.current;
    void (async () => {
      const demo = consumeDemoMfa();
      if (demo === "expired") {
        setNote({ kind: "info", messageKey: "states.mfaExpired" });
        try {
          const challenge = await authFlow.beginMfaChallenge();
          if (alive()) challengeRef.current = challenge.challenge_id;
        } catch {
          challengeRef.current = undefined;
        }
        return;
      }
      setNote(null);
      setBtnBusy(true);
      setOperatorStep(1); // touch
      await delay(T.verify);
      if (!alive()) return;
      if (demo === "fail") {
        // The hardware-key roster always verifies server-side, so the failed
        // key touch is simulated at the ceremony layer (demo review surface).
        setBtnBusy(false);
        setOperatorStep(0);
        setNote({ kind: "error", messageKey: "states.mfaFailed" });
        return;
      }
      setOperatorStep(2); // verifying
      try {
        await authFlow.verifyMfa({
          challenge_id: challengeRef.current,
          method: "hardware-key",
          code: "",
        });
        await delay(T.verify);
        if (!alive()) return;
        setBtnBusy(false);
        setLoadingKey("loading");
        setScreen("loading");
        await delay(T.redirect);
        if (!alive()) return;
        await land(alive);
      } catch (cause) {
        if (!alive()) return;
        setBtnBusy(false);
        setOperatorStep(0);
        setNote(resolveErrorNote(cause, "factor", surface));
        setScreen("factor");
      }
    })();
  }

  function confirmClinic() {
    const my = ++seq.current;
    const alive = () => my === seq.current;
    void (async () => {
      if (selectedClinic === null) return;
      setNote(null);
      setBtnBusy(true);
      try {
        await authFlow.selectClinic({ clinic_id: selectedClinic });
        await delay(T.press);
        if (!alive()) return;
        setBtnBusy(false);
        setLoadingKey("loading");
        setScreen("loading");
        await delay(T.redirect);
        if (!alive()) return;
        await land(alive);
      } catch (cause) {
        if (!alive()) return;
        setBtnBusy(false);
        setNote(resolveErrorNote(cause, "clinic", surface));
        setScreen("clinic");
      }
    })();
  }

  // ---- landed: quiet confirm, then the real destination handoff ----
  async function land(alive: () => boolean) {
    setNote(null);
    // Redeem the single-use deep-link token (second redeems return invalid).
    let target: string | null = null;
    if (deepLinkRef.current) {
      try {
        const redeemed = await authFlow.redeemDeepLinkToken({
          token: deepLinkRef.current,
        });
        if (redeemed.valid) target = redeemed.return_target;
      } catch {
        target = null;
      }
      deepLinkRef.current = null;
    }
    if (!alive()) return;
    setLandedReturn(Boolean(target));
    setScreen("landed");
    if (mocksActive && typeof document !== "undefined") {
      // Presence-only session marker for the middleware gate (MSW cannot set
      // an httpOnly cookie in the real browser jar). Cleared at sign-out.
      document.cookie = `${MOCK_SESSION_COOKIE}=1; path=/; SameSite=Lax`;
      try {
        const scenario = await import("@acuity/api-client/mocks/scenario");
        // Re-authentication establishes a fresh session: clear a simulated
        // session-expiry so the destination loads under the new session.
        scenario.setMockScenario({ sessionExpired: false });
      } catch {
        // Scenario module unavailable — nothing to clear.
      }
    }
    const destination = resolveDestination({
      redeemedTarget: target,
      landingPath: config.landingPath,
      locale: displayLocale,
    });
    await delay(T.redirect);
    if (!alive()) return;
    router.push(destination);
  }

  // ---- recovery / permission / navigation ----
  function cancelFlows() {
    seq.current += 1;
  }

  function openRecovery() {
    cancelFlows();
    setNote(null);
    setBtnBusy(false);
    setRecoveryStarted(false);
    setScreen("recovery");
  }

  function startRecoveryFlow() {
    const my = ++seq.current;
    const alive = () => my === seq.current;
    void (async () => {
      setNote(null);
      setBtnBusy(true);
      try {
        await authFlow.startRecovery({});
        await delay(T.press);
        if (!alive()) return;
        setBtnBusy(false);
        setRecoveryStarted(true);
      } catch (cause) {
        if (!alive()) return;
        setBtnBusy(false);
        setNote(resolveErrorNote(cause, "recovery", surface));
      }
    })();
  }

  function backToSignIn() {
    cancelFlows();
    setNote(null);
    setBtnBusy(false);
    setOperatorStep(0);
    setSelectedClinic(null);
    setRecoveryStarted(false);
    setScreen("identity");
  }

  // In-place language toggle (doctor acceptance #7): the card copy re-renders
  // without leaving it — flow state is preserved; the URL and <html lang> are
  // kept truthful without a navigation.
  function toggleLanguage() {
    const next: Locale = displayLocale === "en-HK" ? "zh-Hant-HK" : "en-HK";
    onLocaleChange(next);
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        swapLocaleInPath(window.location.pathname, locales, next) +
          window.location.search,
      );
    }
  }

  function goToConsole() {
    const href = config.peerSignInHref;
    if (!href) return;
    if (href.startsWith("/")) {
      router.push(`/${displayLocale}${href}`);
    } else if (typeof window !== "undefined") {
      window.location.assign(href);
    }
  }

  // ---- derived copy ----
  let heading = s("heading");
  let support: string | null = s("support");
  if (screen === "factor") {
    heading = s("factorHeading");
    support = isOperator ? null : s("factorSupport");
  } else if (screen === "clinic") {
    heading = s("clinicHeading");
    support = s("clinicSupport");
  } else if (screen === "recovery") {
    heading = s("recoveryHeading");
    support = null;
  }

  const primary = derivePrimary();
  function derivePrimary(): {
    label: string;
    onClick: () => void;
    busyLabel?: string;
    busyTone?: "success" | "navy";
  } | null {
    switch (screen) {
      case "identity":
        return { label: common("signIn"), onClick: () => submitIdentity() };
      case "factor":
        return isOperator
          ? {
              label: s("factorAction"),
              onClick: runOperatorKey,
              busyLabel: s("factorBusy"),
              busyTone: "navy",
            }
          : { label: common("confirm"), onClick: confirmDoctorFactor };
      case "clinic":
        return { label: common("continue"), onClick: confirmClinic };
      case "recovery":
        return recoveryStarted
          ? null
          : { label: common("startRecovery"), onClick: startRecoveryFlow };
      default:
        return null;
    }
  }

  const noteVisible =
    note && screen !== "loading" && screen !== "landed" && screen !== "permission";

  // ---- region ----
  let region: ReactNode;
  if (screen === "loading") {
    region = <LoadingRegion label={common(loadingKey)} />;
  } else if (screen === "landed") {
    region = <LandedRegion text={s(landedReturn ? "landedReturn" : "landed")} />;
  } else if (screen === "permission") {
    region = <PermissionRegion text={s("states.permissionDenied")} />;
  } else if (screen === "recovery") {
    region = (
      <RecoveryRegion
        body={s(isOperator ? "states.lostKey" : "states.lostDevice")}
        startedText={s("recoveryStarted")}
        started={recoveryStarted}
      />
    );
  } else if (screen === "factor") {
    region = isOperator ? (
      <OperatorFactorRegion
        steps={[
          s("factorSteps.insert"),
          s("factorSteps.touch"),
          s("factorSteps.verify"),
        ]}
        current={operatorStep}
      />
    ) : (
      <DoctorFactorRegion hint={s("factorHint")} />
    );
  } else if (screen === "clinic") {
    region = (
      <ClinicRegion
        clinics={clinics}
        selected={selectedClinic}
        onSelect={setSelectedClinic}
        groupLabel={s("clinicAria")}
        displayName={(clinic) => ({
          name: displayLocale === "zh-Hant-HK" ? clinic.nameZh : clinic.nameEn,
          sub: clinic.clinicCode,
        })}
      />
    );
  } else {
    region = (
      <IdentityRegion
        email={email}
        password={password}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        emailLabel={common("emailLabel")}
        passwordLabel={common("passwordLabel")}
        disabled={!ready}
      />
    );
  }

  return (
    <div className="auth-ground" lang={displayLocale}>
      <Card
        role="main"
        aria-labelledby="auth-heading"
        className="auth-card gap-0 border-border p-6 md:p-8"
      >
        <CardHeader className="gap-0 px-0">
          {/* Wordmark */}
          <div className="auth-wordmark font-title" aria-label={common("wordmark")}>
            {common("wordmark")}
          </div>

          {/* Head slot — operator distinct-host signal (read first) */}
          {isOperator && (
            <div className="mt-8 flex items-start gap-2" role="note">
              <span aria-hidden="true" className="mt-0.5 text-venice">
                <ShieldIcon size={16} />
              </span>
              <span className="flex flex-col">
                <span className="auth-host-eyebrow">{s("hostEyebrow")}</span>
                <span className="text-sm text-foreground">
                  {config.hostName ?? s("hostName")}
                </span>
              </span>
            </div>
          )}

          {/* Heading block */}
          <div className={cn("flex flex-col gap-2", isOperator ? "mt-4" : "mt-8")}>
            <h1 id="auth-heading" className="auth-heading">
              {heading}
            </h1>
            {support && <p className="text-base text-foreground">{support}</p>}
          </div>
        </CardHeader>

        <CardContent className="mt-8 flex flex-col gap-0 px-0">
          {/* Form region + primary action: one form so Enter submits the
              active step's primary control. */}
          <form
            ref={formRef}
            // The journey does its own field gating + calm error notes;
            // native constraint bubbles (type="email" vs username-style demo
            // logins) must never silently block the submit.
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (primary && !btnBusy) primary.onClick();
            }}
            className="flex flex-col gap-0"
          >
            <div className="auth-region flex flex-col gap-4" key={screen}>
              {noteVisible && note && (
                <JourneyNote note={note} text={s(note.messageKey)} />
              )}
              {region}
            </div>
            {primary && (
              <div className="mt-8">
                <PrimaryButton
                  label={primary.label}
                  busy={btnBusy}
                  busyLabel={primary.busyLabel}
                  busyTone={primary.busyTone ?? "success"}
                  describedBy={noteVisible ? NOTE_ID : undefined}
                  disabled={
                    !ready ||
                    (screen === "identity" && (!email.trim() || !password))
                  }
                />
              </div>
            )}
          </form>

          {/* Secondary links */}
          <SecondaryLinks
            screen={screen}
            isOperator={isOperator}
            hasConsoleLink={Boolean(config.peerSignInHref)}
            backLabel={common("back")}
            recoveryLabel={s("recovery")}
            langToggleLabel={isOperator ? "" : s("langToggle")}
            goToConsoleLabel={isOperator ? "" : s("goToConsole")}
            onRecovery={openRecovery}
            onBack={backToSignIn}
            onToggleLanguage={toggleLanguage}
            onGoToConsole={goToConsole}
          />
        </CardContent>
      </Card>

      <FooterStrip
        privacyHref={config.privacyHref ?? "/privacy"}
        privacyLabel={common("footerPrivacy")}
        termsHref={config.termsHref ?? "/terms"}
        termsLabel={common("footerTerms")}
      />
    </div>
  );
}

// ---- secondary links --------------------------------------------------------

function SecondaryLinks({
  screen,
  isOperator,
  hasConsoleLink,
  backLabel,
  recoveryLabel,
  langToggleLabel,
  goToConsoleLabel,
  onRecovery,
  onBack,
  onToggleLanguage,
  onGoToConsole,
}: {
  screen: AuthScreen;
  isOperator: boolean;
  hasConsoleLink: boolean;
  backLabel: string;
  recoveryLabel: string;
  langToggleLabel: string;
  goToConsoleLabel: string;
  onRecovery: () => void;
  onBack: () => void;
  onToggleLanguage: () => void;
  onGoToConsole: () => void;
}) {
  if (screen === "loading" || screen === "landed") return null;

  if (screen === "recovery") {
    return (
      <LinkRow>
        <LinkButton onClick={onBack}>{backLabel}</LinkButton>
      </LinkRow>
    );
  }

  if (screen === "permission") {
    return (
      <LinkRow>
        {!isOperator && hasConsoleLink && (
          <>
            <LinkButton onClick={onGoToConsole}>{goToConsoleLabel}</LinkButton>
            <LinkDot />
          </>
        )}
        <LinkButton onClick={onBack}>{backLabel}</LinkButton>
      </LinkRow>
    );
  }

  // identity / factor / clinic — back (post-identity steps), recovery
  // (+ the language toggle on doctor)
  return (
    <LinkRow>
      {(screen === "factor" || screen === "clinic") && (
        <>
          <LinkButton onClick={onBack}>{backLabel}</LinkButton>
          <LinkDot />
        </>
      )}
      <LinkButton onClick={onRecovery}>{recoveryLabel}</LinkButton>
      {!isOperator && (
        <>
          <LinkDot />
          <LinkButton onClick={onToggleLanguage} aria-label={langToggleLabel}>
            {langToggleLabel}
          </LinkButton>
        </>
      )}
    </LinkRow>
  );
}
