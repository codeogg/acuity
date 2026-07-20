"use client";

// New doctor account — dialog form (clinic + name + login) creating through
// the contract endpoint; replaces the reference's inert New-doctor control.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { useToast } from "@acuity/ui";
import { doctors } from "@acuity/api-client";

export function NewDoctorButton({ clinics }: { clinics: { id: number; label: string }[] }) {
  const t = useTranslations("doctors.new");
  const [open, setOpen] = useState(false);
  const [clinicId, setClinicId] = useState(clinics[0] ? String(clinics[0].id) : "");
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  function submit() {
    if (!clinicId || !name.trim() || !login.trim()) return;
    startTransition(async () => {
      try {
        // This browser-originated request stays on the same origin and carries
        // the httpOnly access_token cookie automatically.
        await doctors.createDoctor({
          clinic_id: Number(clinicId),
          doctor_name: name.trim(),
          doctor_name_en: name.trim(),
          login_account: login.trim(),
          password: "changeme-on-first-signin",
        });
        showToast(t("created", { login: login.trim() }));
        setOpen(false);
        setName("");
        setLogin("");
        router.refresh();
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Unable to create doctor", "error");
      }
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <AcuityIcon name="plus" size={18} />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="dialog-wide rounded-2xl border-border bg-card p-6 shadow-[0_20px_55px_rgba(19,35,63,0.22)]">
          <DialogHeader>
            <DialogTitle className="font-title text-lg tracking-tight">{t("title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("clinic")}</label>
              <Select value={clinicId} onValueChange={setClinicId}>
                <SelectTrigger aria-label={t("clinic")} className="h-10 w-full rounded-lg border-border bg-muted/55">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {clinics.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("name")}</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label={t("name")}
                className="h-10 rounded-lg bg-background"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("login")}</label>
              <Input
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                aria-label={t("login")}
                className="h-10 rounded-lg bg-background"
              />
            </div>
            <p className="max-w-[17rem] text-xs leading-5 text-muted-foreground">{t("mfa-note")}</p>
          </div>
          <DialogFooter className="border-t border-border pt-4 sm:justify-end">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              size="sm"
              className="rounded-full px-4 shadow-sm"
              onClick={submit}
              disabled={pending || !clinicId || !name.trim() || !login.trim()}
            >
              {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
