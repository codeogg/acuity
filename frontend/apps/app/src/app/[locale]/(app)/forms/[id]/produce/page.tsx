import { setRequestLocale } from "next-intl/server";
import { Produce } from "./produce";

// Loop step 5: produce and deliver.
export default async function ProducePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <Produce claimId={Number(id)} />;
}
