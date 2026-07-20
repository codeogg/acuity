import { setRequestLocale } from "next-intl/server";
import { FormSelection } from "./form-selection";

// WORK -> New form: the form-fill loop's first step (form selection).
export default async function NewFormPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <FormSelection />;
}
