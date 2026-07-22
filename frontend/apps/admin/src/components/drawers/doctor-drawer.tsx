// Doctor detail drawer (server component) — four facets: Overview /
// Usage & settings / Account / Impersonate, with the revoke + impersonate
// footer. Opens over the doctors grid via ?open=<id>&facet=<facet>.

import { Link } from "@acuity/i18n/navigation";
import { pickName } from "@acuity/i18n/names";
import { getTranslations } from "next-intl/server";
import { ApiError } from "@acuity/api-client";
import { Button } from "@acuity/ui";
import { RouteDrawer } from "@/components/drawers/drawer-route";
import { FacetTabs } from "@/components/drawers/facet-tabs";
import { MetaBadge } from "@/components/ui/status-badge";
import { AcuityIcon } from "@acuity/ui";
import { KeyVal } from "@/components/ui/detail";
import { Sparkline } from "@/components/ui/charts";
import { GateButton } from "@/components/ui/confirm-gate";
import { ActionButton } from "@/components/ui/action-button";
import { ImpersonateControl } from "@/components/system/impersonate-control";
import {
  resetDoctorPasswordAction,
  setDoctorEnabledAction,
} from "@/lib/actions";
import { DoctorAccountFacet, type LinkedClinicItem } from "@/components/drawers/doctor-facets";
import { doctorAccount, doctorSpecialtyLabel, getDoctor, listClinics, listTags } from "@/lib/data";
import { doctorOps } from "@/lib/ops-model";
import { activationStatus } from "@/lib/status";
import { formatRelative } from "@acuity/i18n/format";

const FACETS = ["overview", "usage", "account", "impersonate"] as const;
type DoctorFacet = (typeof FACETS)[number];

export async function DoctorDrawer({
  locale,
  doctorId,
  facet,
  searchParams,
}: {
  locale: string;
  doctorId: number;
  facet: string;
  searchParams: URLSearchParams;
}) {
  const t = await getTranslations("doctor-drawer");
  const tRoot = await getTranslations();

  let doctor;
  try {
    doctor = await getDoctor(doctorId);
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

  const activeFacet: DoctorFacet = (FACETS as readonly string[]).includes(facet)
    ? (facet as DoctorFacet)
    : "overview";
  const account = doctorAccount(doctor);
  const ops = doctorOps(doctor);
  const [clinicPage, specialtyTags] = [
    await listClinics({ page_size: 100 }),
    await listTags("specialty"),
  ];
  const toItem = (id: number): LinkedClinicItem | null => {
    const c = clinicPage.items.find((x) => x.id === id);
    return c ? { id: c.id, code: c.clinic_code, name: pickName(locale, c.clinic_name, c.clinic_name_en) } : null;
  };
  const linkedClinics = account.clinic_ids
    .map(toItem)
    .filter((c): c is LinkedClinicItem => Boolean(c));
  const linkableClinics = clinicPage.items
    .filter((c) => !account.clinic_ids.includes(c.id))
    .map((c) => ({ id: c.id, code: c.clinic_code, name: pickName(locale, c.clinic_name, c.clinic_name_en) }));
  const clinicName =
    linkedClinics.length === 0
      ? t("individual")
      : linkedClinics.length === 1
        ? linkedClinics[0]!.name
        : t("clinic-plus-n", { name: linkedClinics[0]!.name, count: linkedClinics.length - 1 });
  const enabled = doctor.status === 1;
  const specialty = doctorSpecialtyLabel(doctor, locale);
  const primaryClinicId = doctor.clinic_id ?? linkedClinics[0]?.id ?? null;
  const login = doctor.login_account.toUpperCase();

  const facetHref = (f: DoctorFacet) => {
    const p = new URLSearchParams(searchParams);
    p.set("open", String(doctor.id));
    p.set("facet", f);
    return `/doctors?${p.toString()}`;
  };

  return (
    <RouteDrawer
      title={login}
      description={`${clinicName} · ${specialty}`}
      footer={
        activeFacet === "overview" ? (
          <div className="flex items-center justify-between gap-3">
            {enabled ? (
              <GateButton
                buttonLabel={t("disable")}
                buttonIcon="alert"
                buttonVariant="ghost"
                buttonClassName="text-destructive"
                title={t("disable-title")}
                description={t("disable-feedforward", { login })}
                variant="paste"
                target={doctor.login_account}
                destructive
                confirmLabel={t("disable-confirm")}
                action={setDoctorEnabledAction.bind(null, doctor.id, doctor.login_account, false)}
                successMessage={t("disable-done", { login })}
              />
            ) : (
              <ActionButton
                label={t("enable")}
                icon="check"
                action={setDoctorEnabledAction.bind(null, doctor.id, doctor.login_account, true)}
                successMessage={t("enable-done", { login })}
              />
            )}
            <Button asChild variant="default" size="sm">
              <Link href={facetHref("impersonate")} replace scroll={false}>
                <AcuityIcon name="eye" size={16} />
                {t("impersonate")}
              </Link>
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="mb-3 flex gap-2">
        {!enabled ? (
          <MetaBadge meta={{ tone: "danger", icon: "alert", key: "" }} label={t("disabled-badge")} />
        ) : null}
        <MetaBadge
          meta={
            doctor.signature_url
              ? { tone: "success", icon: "sign", key: "" }
              : { tone: "warning", icon: "sign", key: "" }
          }
          label={doctor.signature_url ? t("signature-uploaded") : t("signature-missing")}
        />
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
          <KeyVal label={t("clinic")}>
            {linkedClinics.length === 0 ? t("individual") : linkedClinics.map((c) => c.name).join(" · ")}
          </KeyVal>
          <KeyVal label={t("specialty")}>{specialty}</KeyVal>
          <KeyVal label={t("account")}>
            <span className="font-mono">{doctor.login_account}</span>
          </KeyVal>
          <KeyVal label={t("contact-email")}>{doctor.email ?? "—"}</KeyVal>
          <KeyVal label={t("reg-no")}>
            <span className="font-mono">{doctor.reg_no ?? "—"}</span>
          </KeyVal>
          <KeyVal label={t("activation")}>
            <MetaBadge meta={activationStatus(ops.activation)} label={tRoot(activationStatus(ops.activation).key)} />
          </KeyVal>
          <KeyVal label={t("last-activity")}>{formatRelative(ops.last_activity, locale, Date.now())}</KeyVal>
          <div className="mt-4 flex flex-wrap gap-2">
            <ActionButton
              label={t("reset-password")}
              icon="key"
              action={resetDoctorPasswordAction.bind(null, doctor.id)}
              successMessage={t("reset-password-done")}
            />
          </div>
        </div>
      ) : null}

      {activeFacet === "usage" ? (
        <div>
          <div className="mb-3 rounded-lg border border-border bg-card p-4">
            <div className="mb-2 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
              {t("usage-30d")}
            </div>
            <Sparkline data={[3, 5, 8, 6, 11, 9, 14]} />
          </div>
          <KeyVal label={t("forms-processed")}>{ops.forms_processed}</KeyVal>
          <KeyVal label={t("pass-rate")}>{ops.pass_rate}%</KeyVal>
          <KeyVal label={t("locale")}>{t("locale-value")}</KeyVal>
          <p className="mt-3 text-xs text-muted-foreground">{t("no-phi")}</p>
        </div>
      ) : null}

      {activeFacet === "account" ? (
        <DoctorAccountFacet
          doctorId={doctor.id}
          login={doctor.login_account}
          email={doctor.email}
          notes={account.notes}
          notesFormat={(account.notes_format as "markdown" | "html") || "markdown"}
          specialtyTagId={doctor.specialty_tag_id}
          specialtyLabel={specialty}
          specialtyTags={specialtyTags}
          locale={locale}
          workspaceSeparation={account.workspace_separation}
          primaryClinicId={primaryClinicId}
          linkedClinics={linkedClinics}
          linkableClinics={linkableClinics}
        />
      ) : null}

      {activeFacet === "impersonate" ? (
        primaryClinicId != null ? (
          <ImpersonateControl
            clinicId={primaryClinicId}
            clinicName={linkedClinics.find((c) => c.id === primaryClinicId)?.name ?? ""}
            doctors={[{ id: doctor.id, label: `${login} · ${specialty}` }]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">{t("impersonate-no-clinic")}</p>
        )
      ) : null}
    </RouteDrawer>
  );
}
