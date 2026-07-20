import { useTranslations } from "next-intl";
import {
  OnBoxGhostButton,
  OnFillButton,
  PageHero,
} from "@/components/marketing";

// Rendered for unmatched routes inside a locale segment. Sits inside the locale
// layout (header/footer + NextIntlClientProvider), so translations resolve.
export default function NotFound() {
  const t = useTranslations("not-found");
  return (
    <PageHero eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")}>
      <div className="flex flex-wrap justify-center gap-3">
        <OnFillButton href="/" size="lg">
          {t("home")}
        </OnFillButton>
        <OnBoxGhostButton href="/insurers" size="lg">
          {t("insurers")}
        </OnBoxGhostButton>
        <OnBoxGhostButton href="/contact" size="lg">
          {t("contact")}
        </OnBoxGhostButton>
      </div>
    </PageHero>
  );
}
