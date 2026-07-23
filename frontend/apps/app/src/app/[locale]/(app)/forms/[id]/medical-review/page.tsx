import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { MedicalReview } from "./medical-review";

export default async function MedicalReviewPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return (
    <Suspense>
      <MedicalReview claimId={Number(id)} />
    </Suspense>
  );
}
