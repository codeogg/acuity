import { setRequestLocale } from "next-intl/server";
import { Patients } from "./patients";

// PATIENTS -> Patients: the thin per-patient index.
export default async function PatientsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <Patients />;
}
