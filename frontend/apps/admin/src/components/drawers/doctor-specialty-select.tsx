"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acuity/ui";
import { useToast } from "@acuity/ui";
import { updateDoctorSpecialtyAction } from "@/lib/actions";
import type { Tag } from "@acuity/types";

export function DoctorSpecialtySelect({
  doctorId,
  login,
  value,
  tags,
  locale,
  fallbackLabel,
}: {
  doctorId: number;
  login: string;
  value: number;
  tags: Tag[];
  locale: string;
  /** Shown when the current tag id is missing from the catalog (e.g. retired). */
  fallbackLabel?: string;
}) {
  const t = useTranslations("doctor-drawer");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  const options = tags.filter((tag) => !tag.retired || tag.id === value);
  const selected = options.find((tag) => tag.id === value);
  const displayLabel = selected
    ? locale.startsWith("zh")
      ? selected.label_zh
      : selected.label_en
    : fallbackLabel;

  function onChange(next: string) {
    const tagId = Number(next);
    if (!tagId || tagId === value) return;
    startTransition(async () => {
      const result = await updateDoctorSpecialtyAction(doctorId, login, tagId);
      if (result.ok) {
        showToast(t("specialty-saved"));
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  return (
    <Select value={String(value)} onValueChange={onChange} disabled={pending}>
      <SelectTrigger
        aria-label={t("specialty")}
        className="h-10 w-full min-w-0 rounded-lg border-border bg-muted/55"
      >
        <SelectValue placeholder={t("specialty-select")}>{displayLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((tag) => (
          <SelectItem key={tag.id} value={String(tag.id)}>
            {locale.startsWith("zh") ? tag.label_zh : tag.label_en}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
