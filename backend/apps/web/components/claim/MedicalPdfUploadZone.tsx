"use client";

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/I18nProvider";
import { cn } from "@/lib/utils";
import { FileText, Upload } from "lucide-react";

type MedicalPdfUploadZoneProps = {
  patientName: string;
  onPatientNameChange: (value: string) => void;
  selectedFile: File | null;
  onFileSelect: (file: File | null) => void;
  onUpload: () => void;
  uploading: boolean;
  uploadLabel?: string;
  hint?: string;
  disabled?: boolean;
};

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function MedicalPdfUploadZone({
  patientName,
  onPatientNameChange,
  selectedFile,
  onFileSelect,
  onUpload,
  uploading,
  uploadLabel,
  hint,
  disabled,
}: MedicalPdfUploadZoneProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const pickPdf = useCallback(
    (file: File | null) => {
      if (!file) {
        onFileSelect(null);
        return;
      }
      if (!isPdfFile(file)) return;
      onFileSelect(file);
    },
    [onFileSelect],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);
      if (disabled || uploading) return;
      pickPdf(event.dataTransfer.files?.[0] ?? null);
    },
    [disabled, uploading, pickPdf],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label>{t("doctor.upload.patientName")}</Label>
        <Input
          value={patientName}
          onChange={(e) => onPatientNameChange(e.target.value)}
          placeholder={t("doctor.upload.patientHint")}
          disabled={disabled || uploading}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("doctor.upload.medicalPdf")}</Label>
        <div
          role="button"
          tabIndex={0}
          onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!disabled && !uploading) fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled && !uploading) setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={handleDrop}
          className={cn(
            "flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragOver
              ? "border-[var(--color-primary)] bg-[var(--color-accent-soft)]"
              : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50 hover:bg-[var(--color-accent-soft)]/40",
            (disabled || uploading) && "cursor-not-allowed opacity-60",
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-primary)]">
            {selectedFile ? <FileText className="h-6 w-6" /> : <Upload className="h-6 w-6" />}
          </div>
          {selectedFile ? (
            <>
              <p className="text-sm font-medium">{selectedFile.name}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {t("doctor.upload.replaceFile")}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">{t("doctor.upload.dropzone")}</p>
              <p className="text-xs text-[var(--color-muted-foreground)]">
                {hint ?? t("doctor.upload.defaultHint")}
              </p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={disabled || uploading}
          onChange={(e) => pickPdf(e.target.files?.[0] ?? null)}
        />
      </div>

      <Button
        className="self-start"
        disabled={!selectedFile || uploading || disabled}
        onClick={onUpload}
      >
        {uploading ? t("doctor.upload.uploading") : uploadLabel ?? t("doctor.flow.upload")}
      </Button>
    </div>
  );
}
