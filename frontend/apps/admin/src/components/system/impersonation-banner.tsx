// Persistent impersonation signal — server-rendered into the initial HTML from
// the (mock) session store on every request, so it is present on reload,
// non-dismissable, and fail-safe: if the session read errors, the signal
// renders in its unresolved form rather than disappearing (overview.md build
// invariant). Text + icon always carry the mode; the tint (view-as sky-blue /
// act-as mist-lavender) is redundant, never load-bearing. A resolved session
// also mounts the tab-title + favicon channels (ImpersonationTabSignal) so
// the signal survives tab-switching.

import { getTranslations } from "next-intl/server";
import { getClinic, getDoctor, getImpersonationSession } from "@/lib/data";
import { endImpersonationAction } from "@/lib/actions";
import { AcuityIcon } from "@acuity/ui";
import { ImpersonationTabSignal } from "@/components/system/impersonation-tab-signal";

export async function ImpersonationBanner({ locale }: { locale: string }) {
  void locale;
  const t = await getTranslations("impersonation");

  let session;
  let failSafe = false;
  try {
    session = (await getImpersonationSession()).active;
  } catch {
    // Fail-safe: an unresolved impersonation flag renders the signal.
    session = null;
    failSafe = true;
  }
  if (!session && !failSafe) return null;

  const isAct = session?.mode === "act-as";
  let doctorLabel = t("unresolved-doctor");
  let clinicLabel = t("unresolved-clinic");
  if (session) {
    const [doctor, clinic] = await Promise.all([
      getDoctor(session.doctor_id).catch(() => null),
      getClinic(session.clinic_id).catch(() => null),
    ]);
    doctorLabel = doctor ? doctor.login_account.toUpperCase() : `DR-${session.doctor_id}`;
    clinicLabel = clinic ? (clinic.clinic_name_en ?? clinic.clinic_name) : `CL-${session.clinic_id}`;
  }

  async function exit() {
    "use server";
    await endImpersonationAction();
  }

  return (
    <div
      role="status"
      className={`flex h-12 shrink-0 items-center gap-3 px-6 text-sm font-medium text-foreground ${
        isAct ? "bg-mist-lavender" : "bg-sky-blue"
      }`}
    >
      {session ? (
        <ImpersonationTabSignal doctor={doctorLabel} mode={isAct ? "act-as" : "view-as"} />
      ) : null}
      <span className="flex">
        <AcuityIcon name={isAct ? "pencil" : "eye"} size={20} />
      </span>
      <span>
        {isAct ? t("acting-as") : t("viewing-as")} <strong className="font-semibold">{doctorLabel}</strong>
        {" · "}
        {clinicLabel}
        {" · "}
        {isAct ? t("editing") : t("read-only")}
      </span>
      <form action={exit} className="ml-auto">
        <button
          type="submit"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-xs font-medium text-primary transition-colors duration-100 hover:bg-accent"
        >
          <AcuityIcon name="x" size={14} />
          {t("exit")}
        </button>
      </form>
    </div>
  );
}
