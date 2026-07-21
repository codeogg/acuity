// Clinic detail drawer (server component) — six facets over the grid:
// Overview / Provisioning / Usage & settings / Account / Onboarding /
// Impersonate, plus the delete + resume-onboarding footer. Opens via
// ?open=<id>&facet=<facet> so the grid context underneath survives.

import { Link } from "@acuity/i18n/navigation";
import { pickName } from "@acuity/i18n/names";
import { getTranslations } from "next-intl/server";
import { ApiError } from "@acuity/api-client";
import { Button } from "@acuity/ui";
import { RouteDrawer } from "@/components/drawers/drawer-route";
import { FacetTabs } from "@/components/drawers/facet-tabs";
import { MetaBadge } from "@/components/ui/status-badge";
import { Avatar } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { KeyVal, FacetSection } from "@/components/ui/detail";
import { Sparkline } from "@/components/ui/charts";
import { GateButton } from "@/components/ui/confirm-gate";
import { ImpersonateControl } from "@/components/system/impersonate-control";
import { AccountFacet, NewClinicForm, OnboardingFacet, ProvisioningFacet } from "@/components/drawers/clinic-facets";
import { StatusBadge } from "@/components/ui/ui-client";
import { deleteClinicAction } from "@/lib/actions";
import { clinicAccount, getClinic, getClinicConfigOverview, listDoctorRows } from "@/lib/data";
import { clinicOps } from "@/lib/ops-model";
import { clinicOpsStatus } from "@/lib/status";
import { formatRelative } from "@acuity/i18n/format";

const FACETS = ["overview", "provisioning", "usage", "account", "onboarding", "impersonate"] as const;
export type ClinicFacet = (typeof FACETS)[number];

export async function ClinicDrawer({
  locale,
  clinicId,
  facet,
  isNew,
  searchParams,
}: {
  locale: string;
  clinicId: number | null;
  facet: string;
  isNew: boolean;
  searchParams: URLSearchParams;
}) {
  const t = await getTranslations("clinic-drawer");
  const tRoot = await getTranslations();

  if (isNew) {
    return (
      <RouteDrawer title={t("new-title")} description={t("new-eyebrow")}>
        <NewClinicForm />
      </RouteDrawer>
    );
  }
  if (clinicId == null) return null;

  let clinic;
  try {
    clinic = await getClinic(clinicId);
  } catch (err) {
    if (err instanceof ApiError && err.kind === "not_found") {
      return (
        <RouteDrawer title={t("not-found-title")}>
          <p className="text-sm text-muted-foreground" data-testid="drawer-not-found">
            {t("not-found-body")}
          </p>
        </RouteDrawer>
      );
    }
    throw err;
  }

  const activeFacet: ClinicFacet = (FACETS as readonly string[]).includes(facet)
    ? (facet as ClinicFacet)
    : "overview";
  const [doctorRows, config] = await Promise.all([
    listDoctorRows(undefined, clinic.id),
    getClinicConfigOverview(clinic.id).catch(() => null),
  ]);
  const ops = clinicOps(clinic);
  const clinicName = pickName(locale, clinic.clinic_name, clinic.clinic_name_en);
  const enabledInsurers = (config?.companies ?? [])
    .filter((c) => (c as { enabled?: boolean }).enabled !== false)
    .map((c) => (c as { company_name_en?: string | null; company_name?: string }).company_name_en ?? (c as { company_name?: string }).company_name ?? "")
    .filter(Boolean) as string[];

  const facetHref = (f: ClinicFacet) => {
    const params = new URLSearchParams(searchParams);
    params.set("open", String(clinic.id));
    params.set("facet", f);
    return `/clinics?${params.toString()}`;
  };
  const wide = activeFacet === "provisioning" || activeFacet === "onboarding";
  const signatureUploaded = doctorRows.some((d) => d.doctor.signature_url);

  const summary = {
    id: clinic.id,
    code: clinic.clinic_code,
    name: clinic.clinic_name,
    name_en: clinic.clinic_name_en,
    address: clinic.address,
    phone: clinic.phone,
    idle_lock_minutes: clinic.idle_lock_minutes ?? 10,
  };

  return (
    <RouteDrawer
      title={clinicName}
      description={`${t("eyebrow")} ${clinic.clinic_code}`}
      wide={wide}
      footer={
        activeFacet === "overview" ? (
          <div className="flex items-center justify-between gap-3">
            <GateButton
              buttonLabel={t("delete")}
              buttonIcon="alert"
              buttonVariant="ghost"
              buttonClassName="text-destructive"
              title={t("delete-title")}
              description={t("delete-feedforward", {
                name: clinicName,
                doctors: doctorRows.length,
              })}
              variant="paste"
              target={clinic.clinic_code}
              destructive
              confirmLabel={t("delete-confirm")}
              action={deleteClinicAction.bind(null, clinic.id, clinic.clinic_code)}
              successMessage={t("delete-done", { name: clinicName })}
            />
            <Button asChild variant="default" size="sm">
              <Link href={facetHref("onboarding")} replace scroll={false}>
                <AcuityIcon name="arrow-right" size={16} />
                {t("resume-onboarding")}
              </Link>
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="mb-3">
        <MetaBadge meta={clinicOpsStatus(ops.ops_status)} label={tRoot(clinicOpsStatus(ops.ops_status).key)} />
      </div>
      <FacetTabs
        facets={FACETS.map((f) => ({
          key: f,
          label: t(`facet.${f}`),
          href: facetHref(f),
          active: f === activeFacet,
        }))}
      />

      {activeFacet === "overview" ? (
        <div>
          <div className="mb-6 rounded-lg border border-border bg-card p-5">
            <div className="mb-1.5 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
              {t("activation-headline")}
            </div>
            <div className="flex items-baseline gap-2.5">
              <span className="font-title text-3xl font-semibold text-foreground">{ops.real_forms}</span>
              <span className="text-sm text-muted-foreground">{t("activation-caption")}</span>
            </div>
          </div>
          <FacetSection title={t("doctors-heading", { count: doctorRows.length })}>
            {doctorRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("no-doctors")}</p>
            ) : (
              doctorRows.map(({ doctor, ops: dOps, clinics: doctorClinics }) => (
                <Link
                  key={doctor.id}
                  href={`/doctors?open=${doctor.id}&facet=account`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border py-2.5 last:border-0"
                >
                  <Avatar name={doctor.login_account} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {pickName(locale, doctor.doctor_name, doctor.doctor_name_en)}
                    </div>
                    <div className="truncate font-mono text-xs text-muted-foreground">
                      {doctor.login_account.toUpperCase()} ·{" "}
                      {locale.startsWith("zh") ? dOps.specialty_zh : dOps.specialty_en}
                    </div>
                  </div>
                  {/* Below sm the badges take a second row indented under the
                      text (avatar 28px + gap 12px) instead of squeezing the
                      name into a wrap; one row again at sm+. */}
                  <div className="flex shrink-0 items-center gap-1.5 max-sm:w-full max-sm:pl-10">
                    {doctorClinics.length > 1 ? (
                      <StatusBadge
                        tone="neutral"
                        appearance="outline"
                        label={t("also-elsewhere", { count: doctorClinics.length - 1 })}
                      />
                    ) : null}
                  </div>
                </Link>
              ))
            )}
          </FacetSection>
          <FacetSection title={t("quick-actions")}>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={facetHref("provisioning")} replace scroll={false}>
                  <AcuityIcon name="settings" size={16} />
                  {t("facet.provisioning")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={facetHref("impersonate")} replace scroll={false}>
                  <AcuityIcon name="eye" size={16} />
                  {t("facet.impersonate")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/audit?clinic=${clinic.clinic_code}&tab=clinic`}>
                  <AcuityIcon name="audit" size={16} />
                  {t("audit-deep-link")}
                </Link>
              </Button>
            </div>
          </FacetSection>
        </div>
      ) : null}

      {activeFacet === "provisioning" ? (
        <ProvisioningFacet
          clinic={summary}
          ops={ops}
          doctorCount={doctorRows.length}
          insurers={enabledInsurers}
          signatureUploaded={signatureUploaded}
        />
      ) : null}

      {activeFacet === "usage" ? (
        <div>
          <FacetSection title={t("usage.settings")}>
            <KeyVal label={t("usage.locale")}>{t("usage.locale-value")}</KeyVal>
            <KeyVal label={t("usage.signature")}>
              {signatureUploaded ? t("usage.signature-uploaded") : t("usage.signature-missing")}
            </KeyVal>
            <KeyVal label={t("usage.default-forms")}>
              {t("usage.default-forms-value", { count: enabledInsurers.length })}
            </KeyVal>
            <KeyVal label={t("usage.idle-lock")}>{t("usage.idle-lock-value", { minutes: clinic.idle_lock_minutes ?? 10 })}</KeyVal>
          </FacetSection>
          <FacetSection title={t("usage.insights")}>
            <div className="mb-3 rounded-lg border border-border bg-card p-4">
              <div className="mb-2 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
                {t("usage.forms-30d")}
              </div>
              <Sparkline data={[12, 18, 22, 19, 28, 31, 26]} />
            </div>
            <KeyVal label={t("usage.verify-pass")}>94%</KeyVal>
            <KeyVal label={t("usage.confidence")}>91%</KeyVal>
            <KeyVal label={t("usage.last-active")}>
              {formatRelative(ops.last_activity, locale, Date.now())}
            </KeyVal>
            <p className="mt-3 text-xs text-muted-foreground">{t("usage.no-phi")}</p>
          </FacetSection>
        </div>
      ) : null}

      {activeFacet === "account" ? (
        <AccountFacet clinic={summary} ops={ops} notes={clinicAccount(clinic).notes} />
      ) : null}
      {activeFacet === "onboarding" ? <OnboardingFacet clinic={summary} ops={ops} /> : null}
      {activeFacet === "impersonate" ? (
        <ImpersonateControl
          clinicId={clinic.id}
          clinicName={clinicName}
          doctors={doctorRows.map(({ doctor, ops: dOps }) => ({
            id: doctor.id,
            label: `${doctor.login_account.toUpperCase()} · ${locale.startsWith("zh") ? dOps.specialty_zh : dOps.specialty_en}`,
          }))}
        />
      ) : null}
    </RouteDrawer>
  );
}
