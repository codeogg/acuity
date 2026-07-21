"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { CompanyOut } from "@acuity/types";
import { companies } from "@acuity/api-client";
import {
  AcuityIcon,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  useToast,
} from "@acuity/ui";
import { updateCompanyAction } from "@/lib/actions";

type Props = { company: CompanyOut };

export function EditInsurerButton({ company }: Props) {
  const t = useTranslations("insurer-detail");
  const router = useRouter();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [nameZh, setNameZh] = useState(company.company_name);
  const [nameEn, setNameEn] = useState(company.company_name_en ?? "");
  const [contact, setContact] = useState(company.contact_info ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [preview, setPreview] = useState<string | null>(company.logo_url);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!file) {
      setPreview(removeLogo ? null : company.logo_url);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [company.logo_url, file, removeLogo]);

  function chooseLogo(nextFile: File | undefined) {
    if (!nextFile) return;
    if (!nextFile.type.startsWith("image/")) {
      showToast(t("logo-invalid"), "error");
      return;
    }
    if (nextFile.size > 5 * 1024 * 1024) {
      showToast(t("logo-too-large"), "error");
      return;
    }
    setRemoveLogo(false);
    setFile(nextFile);
  }

  function reset() {
    setNameZh(company.company_name);
    setNameEn(company.company_name_en ?? "");
    setContact(company.contact_info ?? "");
    setFile(null);
    setRemoveLogo(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function openEditor() {
    reset();
    setOpen(true);
  }

  function submit() {
    if (!nameZh.trim()) return;
    startTransition(async () => {
      try {
        const logoUrl = file
          ? (await companies.uploadCompanyLogo(file, file.name)).url
          : removeLogo
            ? null
            : undefined;
        const result = await updateCompanyAction(company.id, {
          company_name: nameZh.trim(),
          company_name_en: nameEn.trim() || null,
          contact_info: contact.trim() || null,
          ...(logoUrl !== undefined ? { logo_url: logoUrl } : {}),
        });
        if (!result.ok) {
          showToast(result.message, "error");
          return;
        }
        showToast(t("updated"));
        setOpen(false);
        setFile(null);
        setRemoveLogo(false);
        router.refresh();
      } catch (error) {
        showToast(error instanceof Error ? error.message : t("logo-upload-failed"), "error");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={openEditor}>
        <AcuityIcon name="pencil" size={16} />
        {t("edit")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-title">{t("edit-title")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Field label={t("name-zh")} value={nameZh} setValue={setNameZh} />
            <Field label={t("name-en")} value={nameEn} setValue={setNameEn} />
            <Field label={t("contact")} value={contact} setValue={setContact} />
            <div className="rounded-lg border border-dashed border-border bg-muted/35 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-foreground">{t("logo")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("logo-hint")}</p>
                </div>
                {preview ? <img src={preview} alt="" className="h-10 w-16 rounded-md border border-border bg-background object-contain p-1" /> : null}
              </div>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(event) => chooseLogo(event.target.files?.[0])} />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
                  <AcuityIcon name="upload" size={16} />
                  {preview ? t("logo-replace") : t("logo-choose")}
                </Button>
                {preview ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => { setFile(null); setRemoveLogo(true); if (inputRef.current) inputRef.current.value = ""; }}>
                    {t("logo-remove")}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            <Button onClick={submit} disabled={pending || !nameZh.trim()}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      <Input value={value} onChange={(event) => setValue(event.target.value)} aria-label={label} />
    </div>
  );
}
