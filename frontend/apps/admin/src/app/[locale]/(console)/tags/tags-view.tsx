"use client";

// Tags surface body — taxonomy tree (three kinds, child chips with grip +
// retire-with-re-map ack gate + add-child form) and the per-doctor visibility
// matrix (per-category toggles over the tag-visibility entries).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Input } from "@acuity/ui";
import type { frontendOnly } from "@acuity/api-client";
import { AcuityIcon } from "@acuity/ui";
import { GateButton } from "@/components/ui/confirm-gate";
import { useToast } from "@acuity/ui";
import { createTagAction, retireTagAction, setTagVisibilityAction } from "@/lib/actions";

type Tag = frontendOnly.adminTags.Tag;
type VisibilityEntry = frontendOnly.adminTags.TagVisibilityEntry;

const KINDS = ["type", "insurer", "specialty"] as const;
type Kind = (typeof KINDS)[number];

export function TagsView({
  locale,
  tags,
  visibility,
  doctors,
}: {
  locale: string;
  tags: Tag[];
  visibility: VisibilityEntry[];
  doctors: { id: number; login: string }[];
}) {
  const t = useTranslations("tags");
  const zh = locale.startsWith("zh");
  const label = (tag: Tag) => (zh ? tag.label_zh : tag.label_en);
  const live = tags.filter((tag) => !tag.retired);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[7fr_5fr]">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="mb-4 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          {t("taxonomy")}
        </div>
        {KINDS.map((kind) => {
          const children = live.filter((tag) => tag.kind === kind).sort((a, b) => a.sort_order - b.sort_order);
          return (
            <div key={kind} className="mb-6">
              <div className="mb-2.5 flex items-center gap-2">
                <span className="flex text-muted-foreground">
                  <AcuityIcon name="chevron-down" size={16} />
                </span>
                <span className="text-sm font-semibold text-foreground">{t(`kind-${kind}`)}</span>
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {children.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 pl-6">
                {children.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-sky-blue/25 px-2.5 py-1 text-xs text-foreground"
                  >
                    <span className="flex cursor-grab text-muted-foreground" aria-hidden>
                      <AcuityIcon name="grip" size={11} />
                    </span>
                    {label(tag)}
                    <GateButton
                      buttonLabel=""
                      buttonIcon="x"
                      buttonVariant="ghost"
                      buttonSize="sm"
                      buttonClassName="-my-0.5 size-6 min-w-0 p-0 text-muted-foreground hover:text-destructive"
                      title={t("retire-title", { tag: label(tag) })}
                      description={t("retire-feedforward", { tag: label(tag) })}
                      variant="ack"
                      ackLabel={t("retire-ack")}
                      confirmLabel={t("retire-confirm")}
                      action={() => retireTagAction(tag.id, label(tag))}
                      successMessage={t("retired", { tag: label(tag) })}
                    />
                  </span>
                ))}
                <AddChild kind={kind} />
              </div>
            </div>
          );
        })}
        <p className="text-xs text-muted-foreground">{t("integrity-note")}</p>
      </div>

      <VisibilityMatrix tags={live} visibility={visibility} doctors={doctors} />
    </div>
  );
}

function AddChild({ kind }: { kind: Kind }) {
  const t = useTranslations("tags");
  const [open, setOpen] = useState(false);
  const [labelEn, setLabelEn] = useState("");
  const [labelZh, setLabelZh] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border-strong px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-primary"
      >
        <AcuityIcon name="plus" size={12} />
        {t("add-child")}
      </button>
    );
  }

  function submit() {
    if (!labelEn.trim() || !labelZh.trim()) return;
    startTransition(async () => {
      const result = await createTagAction(kind, labelEn.trim(), labelZh.trim());
      if (result.ok) {
        showToast(t("added", { tag: labelEn.trim() }));
        setOpen(false);
        setLabelEn("");
        setLabelZh("");
        router.refresh();
      } else showToast(result.message, "error");
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Input
        value={labelZh}
        onChange={(e) => setLabelZh(e.target.value)}
        placeholder={t("label-zh")}
        aria-label={t("label-zh")}
        className="h-7 w-24 text-xs"
      />
      <Input
        value={labelEn}
        onChange={(e) => setLabelEn(e.target.value)}
        placeholder={t("label-en")}
        aria-label={t("label-en")}
        className="h-7 w-24 text-xs"
      />
      <Button type="button" size="sm" className="h-7" onClick={submit} disabled={pending || !labelEn.trim() || !labelZh.trim()}>
        {t("add")}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setOpen(false)}>
        <AcuityIcon name="x" size={12} />
      </Button>
    </span>
  );
}

function VisibilityMatrix({
  tags,
  visibility,
  doctors,
}: {
  tags: Tag[];
  visibility: VisibilityEntry[];
  doctors: { id: number; login: string }[];
}) {
  const t = useTranslations("tags");
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  const kindTags = (kind: Kind) => tags.filter((tag) => tag.kind === kind);
  const isVisible = (doctorId: number, kind: Kind) => {
    const ids = kindTags(kind).map((tag) => tag.id);
    if (ids.length === 0) return true;
    return ids.every(
      (tagId) =>
        visibility.find((e) => e.doctor_id === doctorId && e.tag_id === tagId)?.visible !== false,
    );
  };

  function toggle(doctorId: number, kind: Kind) {
    const next = !isVisible(doctorId, kind);
    const entries = kindTags(kind).map((tag) => ({ doctor_id: doctorId, tag_id: tag.id, visible: next }));
    startTransition(async () => {
      const result = await setTagVisibilityAction(entries);
      if (result.ok) {
        showToast(t("visibility-updated"));
        router.refresh();
      } else showToast(result.message, "error");
    });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card p-6">
      <div className="mb-1 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
        {t("visibility")}
      </div>
      <div className="mb-4 text-xs text-muted-foreground">{t("visibility-hint")}</div>
      <table className="w-full border-collapse">
        <caption className="sr-only">{t("visibility")}</caption>
        <thead>
          <tr>
            <th className="px-2 py-1.5 text-left text-xs font-medium text-muted-foreground">{t("col-doctor")}</th>
            {KINDS.map((kind) => (
              <th key={kind} className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground">
                {t(`kind-${kind}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {doctors.map((doctor) => (
            <tr key={doctor.id}>
              <td className="border-t border-border px-2 py-1 font-mono text-sm text-foreground">{doctor.login}</td>
              {KINDS.map((kind) => {
                const visible = isVisible(doctor.id, kind);
                return (
                  <td key={kind} className="border-t border-border px-2 py-1 text-center">
                    <button
                      type="button"
                      onClick={() => toggle(doctor.id, kind)}
                      aria-label={t(visible ? "visible-for" : "hidden-for", {
                        category: t(`kind-${kind}`),
                        doctor: doctor.login,
                      })}
                      aria-pressed={visible}
                      className={`inline-flex size-11 items-center justify-center rounded-md transition-colors hover:bg-accent ${
                        visible ? "text-success" : "text-muted-foreground"
                      }`}
                    >
                      <AcuityIcon name={visible ? "eye" : "x"} size={16} />
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
