import { Suspense } from "react";
import { setRequestLocale } from "next-intl/server";
import { History } from "./history";

// WORK -> Completed: the searchable history of past and in-progress forms.
// Suspense boundary: the client surface reads ?patient= via useSearchParams.
export default async function HistoryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense>
      <History />
    </Suspense>
  );
}
