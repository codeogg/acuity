"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MedicalPdfUploadZone } from "@/components/claim/MedicalPdfUploadZone";
import { PageHeader } from "@/components/shared/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, ApiRequestError } from "@/lib/api/client";
import type { Step1UploadOutput } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

export default function ExtractionTestPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [patientName, setPatientName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      if (patientName.trim()) {
        fd.append("patient_name", patientName.trim());
      }
      return apiFetch<Step1UploadOutput>("/api/doctor/extraction-tasks", {
        method: "POST",
        formData: fd,
      });
    },
    onSuccess: (data) => {
      setError(null);
      router.push(`/doctor/extraction-test/${data.task_id}`);
    },
    onError: (err) => {
      setError(err instanceof ApiRequestError ? err.message : t("doctor.extractionTest.uploadFailed"));
    },
  });

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={t("doctor.extractionTest.title")}
        description={t("doctor.extractionTest.description")}
      />

      <Card>
        <CardContent className="pt-6">
          <MedicalPdfUploadZone
            patientName={patientName}
            onPatientNameChange={setPatientName}
            selectedFile={selectedFile}
            onFileSelect={(file) => {
              setSelectedFile(file);
              setError(null);
            }}
            onUpload={() => {
              if (!selectedFile) {
                setError(t("doctor.flow.selectPdf"));
                return;
              }
              upload.mutate(selectedFile);
            }}
            uploading={upload.isPending}
            uploadLabel={t("doctor.extractionTest.uploadCreate")}
            hint={t("doctor.extractionTest.uploadHint")}
          />

          {error && (
            <p className="mt-4 text-sm text-[var(--color-destructive)]">{error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
