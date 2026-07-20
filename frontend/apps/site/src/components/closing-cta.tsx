import { cn } from "@/lib/cn";
import { getTranslations } from "next-intl/server";
import { Button } from "@acuity/ui";
import { Band, Panel, marketingButtonSizeClass } from "@/components/marketing";
import { WhatsAppButton } from "@/components/handoff";
import { Link } from "@/i18n/navigation";
import { WHATSAPP } from "@/lib/channels";

// The shared closing action band — a centred navy panel with the WhatsApp CTA
// and (on home / how-it-works only) a quiet secondary route to the contact
// page. Reference grammar per page: home carries "or book a 20-minute demo"
// → contact; how-it-works carries "See all contact options" → contact; the
// insurer / customers / about / Bupa closings are WhatsApp-only.
export async function ClosingCta({
  title,
  lede,
  primaryLabel,
  secondary = "none",
}: {
  title?: string;
  lede?: string;
  primaryLabel?: string;
  secondary?: "demo" | "contact" | "none";
}) {
  const t = await getTranslations("cta");

  return (
    <Band>
      <Panel tone="navy" center>
        <h2 className="mx-auto max-w-[24ch] text-h2 text-on-navy">
          {title ?? t("call-title")}
        </h2>
        {lede !== "" ? (
          <p className="mx-auto mt-4 max-w-[46ch] text-body-lg text-on-navy/80">
            {lede ?? t("call-lede")}
          </p>
        ) : null}
        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <WhatsAppButton href={WHATSAPP} onFill>
            {primaryLabel ?? t("whatsapp")}
          </WhatsAppButton>
          {secondary !== "none" ? (
            <Button
              asChild
              className={cn(
                marketingButtonSizeClass("lg"),
                "border border-on-navy/30 bg-transparent text-on-navy hover:bg-on-navy/10 hover:text-on-navy",
              )}
            >
              <Link href="/contact">
                <span className="btn-label">
                  {secondary === "demo" ? t("book-demo") : t("all-contact")}
                </span>
              </Link>
            </Button>
          ) : null}
        </div>
      </Panel>
    </Band>
  );
}
