"use client";

// Upload dropzone — blank insurer-form PDFs only (no PHI). Drag-and-drop or
// click-to-choose; each upload starts the parse pipeline via the multipart
// contract endpoint and lands in the Intake worklist.

import { useRef, useState, useTransition } from "react";
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
import { uploadTemplateAction } from "@/lib/actions";

export function UploadDropzone({
  companies,
  variant,
}: {
  companies: { id: number; label: string }[];
  variant: "zone" | "button";
}) {
  const t = useTranslations("forms.upload");
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [companyId, setCompanyId] = useState(companies[0] ? String(companies[0].id) : "");
  const [dragging, setDragging] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  function pick(next: File) {
    setFile(next);
    setName(next.name.replace(/\.pdf$/i, ""));
  }

  function submit() {
    if (!file || !companyId || !name.trim()) return;
    const formData = new FormData();
    formData.set("file", file);
    formData.set("company_id", companyId);
    formData.set("template_name", name.trim());
    startTransition(async () => {
      const result = await uploadTemplateAction(formData);
      if (result.ok) {
        showToast(t("started", { name: name.trim() }));
        setFile(null);
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="application/pdf"
      className="hidden"
      aria-label={t("choose")}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) pick(f);
        e.target.value = "";
      }}
    />
  );

  const dialog = (
    <Dialog open={Boolean(file)} onOpenChange={(open) => !open && setFile(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-title">{t("dialog-title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("no-phi")}</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("display-name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("display-name")} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("insurer")}</label>
            <Select value={companyId} onValueChange={setCompanyId}>
              <SelectTrigger aria-label={t("insurer")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="font-mono text-xs text-muted-foreground">{file?.name}</p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setFile(null)}>
            {t("cancel")}
          </Button>
          <Button onClick={submit} disabled={pending || !name.trim() || !companyId}>
            <AcuityIcon name="upload" size={16} />
            {t("upload")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (variant === "button") {
    return (
      <>
        {input}
        <Button type="button" onClick={() => inputRef.current?.click()}>
          <AcuityIcon name="upload" size={18} />
          {t("button")}
        </Button>
        {dialog}
      </>
    );
  }

  return (
    <>
      {input}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) pick(f);
        }}
        style={{ borderWidth: 1.5 }}
        className={`flex w-full items-center gap-3.5 rounded-lg border border-dashed p-4 text-left transition-colors ${
          dragging ? "border-primary bg-sky-blue/20" : "border-border-strong bg-muted/40"
        }`}
      >
        <span className="flex text-tone-info">
          <AcuityIcon name="upload" size={22} />
        </span>
        <span>
          <span className="block text-sm font-medium text-foreground">{t("drop-title")}</span>
          <span className="block text-xs text-muted-foreground">{t("drop-hint")}</span>
        </span>
      </button>
      {dialog}
    </>
  );
}
