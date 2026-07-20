import { setRequestLocale } from "next-intl/server";
import { Extraction } from "./extraction";

// Loop step 3: extraction (the honest wait).
export default async function ExtractionPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <Extraction claimId={Number(id)} />;
}
