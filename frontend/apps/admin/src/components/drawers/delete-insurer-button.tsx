"use client";

// Delete insurer — only offered when the company has no bound templates.
// Backend also rejects delete when templates or claims exist.

import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { GateButton } from "@/components/ui/confirm-gate";
import { deleteCompanyAction } from "@/lib/actions";

export function DeleteInsurerButton({
  companyId,
  companyCode,
  companyName,
}: {
  companyId: number;
  companyCode: string;
  companyName: string;
}) {
  const t = useTranslations("insurer-detail");
  const locale = useLocale();
  const router = useRouter();

  return (
    <GateButton
      buttonLabel={t("delete")}
      buttonIcon="trash"
      buttonVariant="ghost"
      buttonClassName="text-destructive"
      title={t("delete-title")}
      description={t("delete-feedforward", { name: companyName })}
      variant="ack"
      destructive
      ackLabel={t("delete-ack")}
      confirmLabel={t("delete-confirm")}
      action={deleteCompanyAction.bind(null, companyId, companyCode)}
      successMessage={t("delete-done", { name: companyName })}
      onDone={() => router.push(`/${locale}/insurers`)}
    />
  );
}
