import { setRequestLocale } from "next-intl/server";
import { Intake } from "./intake";

// Loop step 2: intake. Dynamic per-claim route.
export default async function IntakePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <Intake claimId={Number(id)} />;
}
