"use client";

// New insurer dialog — creates through the contract endpoint (replaces the
// prior inert New control).

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, Input } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { useToast } from "@acuity/ui";
import { companies } from "@acuity/api-client";
import { createCompanyAction } from "@/lib/actions";

export function NewInsurerButton() {
  const t = useTranslations("insurers.new");
  const [open, setOpen] = useState(false);
  const [nameZh, setNameZh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [contact, setContact] = useState("");
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    if (!logo) {
      setLogoPreview(null);
      return;
    }
    const preview = URL.createObjectURL(logo);
    setLogoPreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [logo]);

  function chooseLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast(t("logo-invalid"), "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast(t("logo-too-large"), "error");
      return;
    }
    setLogo(file);
  }

  function submit() {
    if (!nameZh.trim()) return;
    startTransition(async () => {
      try {
        const logoUrl = logo
          ? (await companies.uploadCompanyLogo(logo, logo.name)).url
          : null;
        const result = await createCompanyAction({
          company_name: nameZh.trim(),
          company_name_en: nameEn.trim() || null,
          contact_info: contact.trim() || null,
          logo_url: logoUrl,
        });
        if (result.ok) {
          showToast(t("created", { name: nameEn.trim() || nameZh.trim() }));
          setOpen(false);
          setNameZh("");
          setNameEn("");
          setContact("");
          setLogo(null);
          router.refresh();
        } else showToast(result.message, "error");
      } catch (error) {
        showToast(error instanceof Error ? error.message : t("logo-upload-failed"), "error");
      }
    });
  }

  const field = (label: string, value: string, set: (v: string) => void) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <Input value={value} onChange={(e) => set(e.target.value)} aria-label={label} />
    </div>
  );

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <AcuityIcon name="plus" size={18} />
        {t("button")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-title">{t("title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {field(t("name-zh"), nameZh, setNameZh)}
            {field(t("name-en"), nameEn, setNameEn)}
            {field(t("contact"), contact, setContact)}
            <div className="rounded-lg border border-dashed border-border bg-muted/35 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground">{t("logo")}</label>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("logo-hint")}</p>
                </div>
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt={t("logo-preview")}
                    className="h-10 w-16 rounded-md border border-border bg-background object-contain p-1"
                  />
                ) : null}
              </div>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="sr-only"
                onChange={(event) => chooseLogo(event.target.files?.[0])}
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}>
                  <AcuityIcon name="upload" size={16} />
                  {logo ? t("logo-replace") : t("logo-choose")}
                </Button>
                {logo ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setLogo(null);
                      if (logoInputRef.current) logoInputRef.current.value = "";
                    }}
                  >
                    {t("logo-remove")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={submit} disabled={pending || !nameZh.trim()}>
              {t("create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
