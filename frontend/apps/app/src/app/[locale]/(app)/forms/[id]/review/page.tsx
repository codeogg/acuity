import { setRequestLocale } from "next-intl/server";
import { Review } from "./review";

// Loop step 4: review (the keystone surface).
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <Review claimId={Number(id)} />;
}
