"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  REQUIRED_FIELDS,
  getStandardFieldLabel,
} from "@/lib/extraction/standard-field-labels";
import {
  FIELD_GROUPS,
  TEMPLATE_SPECIFIC_GROUP,
  getFieldGroupName,
} from "@/lib/extraction/field-groups";
import { useI18n } from "@/lib/i18n/I18nProvider";

export type TemplateSpecificPlaceholderField = {
  field_code: string;
  field_name: string;
};

export function StandardFieldsPlaceholder({
  templateSpecificFields = [],
}: {
  templateSpecificFields?: TemplateSpecificPlaceholderField[];
}) {
  const { locale, t } = useI18n();
  return (
    <div className="flex flex-col gap-6">
      {FIELD_GROUPS.map((group) => (
        <div key={group.domainCode} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between rounded-md bg-[var(--color-muted)]/50 px-3 py-2">
            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
              {getFieldGroupName(group, locale)}
              <span className="ml-1.5 font-normal text-[var(--color-muted-foreground)]">
                {t("doctor.review.fieldCount", { count: group.fieldCodes.length })}
              </span>
            </h3>
          </div>
          <div className="h-px bg-[var(--color-border)]" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {group.fieldCodes.map((code) => {
              const isRequired = REQUIRED_FIELDS.has(code);
              return (
                <div
                  key={code}
                  className="flex flex-col gap-1.5 rounded-md border border-transparent p-3"
                >
                  <Label className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      {getStandardFieldLabel(code, locale)}
                      {isRequired && (
                        <span className="ml-1 text-[var(--color-destructive)]">*</span>
                      )}
                    </span>
                    <span className="font-mono text-xs text-[var(--color-muted-foreground)]">
                      {code}
                    </span>
                    <Badge variant="secondary">{t("doctor.review.pendingRecognition")}</Badge>
                  </Label>
                  <Input disabled placeholder="—" className="bg-[var(--color-muted)]/30" />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {templateSpecificFields.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between rounded-md bg-[var(--color-muted)]/50 px-3 py-2">
            <h3 className="text-sm font-semibold text-[var(--color-foreground)]">
              {getFieldGroupName(TEMPLATE_SPECIFIC_GROUP, locale)}
              <span className="ml-1.5 font-normal text-[var(--color-muted-foreground)]">
                {t("doctor.review.fieldCount", { count: templateSpecificFields.length })}
              </span>
            </h3>
          </div>
          <div className="h-px bg-[var(--color-border)]" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {templateSpecificFields.map((field) => (
              <div
                key={field.field_code}
                className="flex flex-col gap-1.5 rounded-md border border-transparent p-3"
              >
                <Label className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">{field.field_name}</span>
                  <span className="font-mono text-xs text-[var(--color-muted-foreground)]">
                    {field.field_code}
                  </span>
                  <Badge variant="secondary">{t("doctor.review.pendingRecognition")}</Badge>
                </Label>
                <Input disabled placeholder="—" className="bg-[var(--color-muted)]/30" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
