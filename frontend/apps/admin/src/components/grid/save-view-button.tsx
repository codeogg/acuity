"use client";

// "+" save-current-view control at the end of the saved-view tab strip:
// captures the current filter/sort search params as a named saved view.

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { useToast } from "@acuity/ui";
import { createSavedViewAction } from "@/lib/actions";

export function SaveViewButton({ grid }: { grid: string }) {
  const t = useTranslations("saved-views");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();

  function save() {
    const filters: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      filters[key] = value;
    });
    startTransition(async () => {
      const result = await createSavedViewAction(grid, name || t("default-name"), filters);
      if (result.ok) {
        showToast(t("saved", { name: name || t("default-name") }));
        setOpen(false);
        setName("");
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("add")}
        title={t("add")}
        className="ml-1 inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <AcuityIcon name="plus" size={16} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-title">{t("title")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t("hint")}</p>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("name-placeholder")}
            aria-label={t("name-placeholder")}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={save} disabled={pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
