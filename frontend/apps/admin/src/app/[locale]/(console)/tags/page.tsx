// Tags — the form-tag taxonomy (type / insurer / specialty) + the per-doctor
// visibility matrix (auto-mapped, individually overridable). Retiring a tag
// re-maps its members behind an acknowledgement gate (tag-integrity rule:
// never orphan).

import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SectionTopBar } from "@/components/shell/section-top-bar";
import { CardSkeleton } from "@/components/ui/skeletons";
import { TagsView } from "./tags-view";
import { getTagVisibility, listDoctorRows, listTags } from "@/lib/data";

export default async function TagsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tags");

  return (
    <div className="flex h-full flex-col">
      <SectionTopBar eyebrow={t("eyebrow")} title={t("title")} />
      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <Suspense
          fallback={
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[7fr_5fr]">
              <CardSkeleton height={340} />
              <CardSkeleton height={340} />
            </div>
          }
        >
          <TagsData locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}

async function TagsData({ locale }: { locale: string }) {
  const [tags, visibility, doctorRows] = await Promise.all([
    listTags(),
    getTagVisibility(),
    listDoctorRows(),
  ]);
  return (
    <TagsView
      locale={locale}
      tags={tags}
      visibility={visibility}
      doctors={doctorRows.slice(0, 8).map((r) => ({ id: r.doctor.id, login: r.doctor.login_account.toUpperCase() }))}
    />
  );
}
