"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  FIELD_GROUPS,
  TEMPLATE_SPECIFIC_GROUP,
  getFieldGroupName,
  getStandardFieldLabel,
  REQUIRED_FIELDS,
} from "./field-catalog";

export type TemplateSpecificPlaceholderField = {
  field_code: string;
  field_name: string;
};

/** Empty checklist shown before AI extraction finishes (doctor web parity). */
export function StandardFieldsPlaceholder({
  templateSpecificFields = [],
}: {
  templateSpecificFields?: TemplateSpecificPlaceholderField[];
}) {
  const t = useTranslations("medical-review");
  const locale = useLocale();

  return (
    <div className="flex flex-col gap-6">
      {FIELD_GROUPS.map((group) => (
        <div key={group.domainCode} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between rounded-md bg-muted/50 px-3 py-2">
            <h3 className="text-sm font-semibold text-foreground">
              {getFieldGroupName(group, locale)}
              <span className="ml-1.5 font-normal text-muted-foreground">
                {t("field-count", { count: group.fieldCodes.length })}
              </span>
            </h3>
          </div>
          <div className="h-px bg-border" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {group.fieldCodes.map((code) => (
              <div key={code} className="flex flex-col gap-1.5 rounded-md border border-transparent p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">
                    {getStandardFieldLabel(code, locale)}
                    {REQUIRED_FIELDS.has(code) ? (
                      <span className="ml-1 text-destructive">*</span>
                    ) : null}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">{code}</span>
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t("pending")}
                  </span>
                </div>
                <input
                  disabled
                  placeholder="—"
                  className="h-9 w-full rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground"
                  aria-label={getStandardFieldLabel(code, locale)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {templateSpecificFields.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between rounded-md bg-muted/50 px-3 py-2">
            <h3 className="text-sm font-semibold text-foreground">
              {getFieldGroupName(TEMPLATE_SPECIFIC_GROUP, locale)}
              <span className="ml-1.5 font-normal text-muted-foreground">
                {t("field-count", { count: templateSpecificFields.length })}
              </span>
            </h3>
          </div>
          <div className="h-px bg-border" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {templateSpecificFields.map((field) => (
              <div
                key={field.field_code}
                className="flex flex-col gap-1.5 rounded-md border border-transparent p-3"
              >
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-foreground">{field.field_name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {field.field_code}
                  </span>
                  <span className="rounded-sm bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t("pending")}
                  </span>
                </div>
                <input
                  disabled
                  placeholder="—"
                  className="h-9 w-full rounded-md border border-border bg-muted/30 px-3 text-sm text-muted-foreground"
                  aria-label={field.field_name}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
