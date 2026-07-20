import { setRequestLocale } from "next-intl/server";
import { WorkHome } from "./work-home";

// WORK -> In progress (the work home). The post-authentication landing.
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <WorkHome />;
}
