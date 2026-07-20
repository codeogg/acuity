"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/I18nProvider";

type IgnoreFieldDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string | null) => void;
  saving?: boolean;
};

export function IgnoreFieldDialog({
  open,
  onOpenChange,
  onConfirm,
  saving = false,
}: IgnoreFieldDialogProps) {
  const [reason, setReason] = useState("");
  const { t } = useI18n();

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  function handleConfirm() {
    onConfirm(reason.trim() || null);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("annotator.ignoreTitle")}</DialogTitle>
          <DialogDescription>
            {t("annotator.ignoreDescription")}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ignore-reason">{t("annotator.ignoreReason")}</Label>
            <Textarea
              id="ignore-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("annotator.ignorePlaceholder")}
              rows={3}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button disabled={saving} onClick={handleConfirm}>
            {t("annotator.confirmIgnore")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
