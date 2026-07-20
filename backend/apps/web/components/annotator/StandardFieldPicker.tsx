"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { StandardField } from "@/lib/api/types";
import { useI18n } from "@/lib/i18n/I18nProvider";

function formatStandardField(f: StandardField): string {
  return `${f.field_code} · ${f.field_name}（${f.data_type}）`;
}

export function StandardFieldPicker({
  fields,
  value,
  onChange,
}: {
  fields: StandardField[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const [keyword, setKeyword] = useState("");
  const { t } = useI18n();

  const selected = useMemo(
    () => (value ? fields.find((f) => f.id === value) ?? null : null),
    [fields, value],
  );

  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return fields;
    return fields.filter(
      (f) =>
        f.field_name.toLowerCase().includes(kw) ||
        f.field_code.toLowerCase().includes(kw) ||
        f.data_type.toLowerCase().includes(kw),
    );
  }, [fields, keyword]);

  function selectField(f: StandardField) {
    onChange(f.id);
    setKeyword("");
  }

  function clearSelection() {
    onChange(null);
    setKeyword("");
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          readOnly
          value={selected ? formatStandardField(selected) : ""}
          placeholder={t("annotator.selectStandardField")}
          className={selected ? "border-[var(--color-primary)] bg-[var(--color-muted)]/40" : ""}
        />
        {selected && (
          <Button type="button" variant="outline" size="sm" onClick={clearSelection}>
            {t("common.clear")}
          </Button>
        )}
      </div>
      <Input
        placeholder={t("annotator.searchStandardField")}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      <div className="max-h-56 overflow-auto rounded-lg border">
        {filtered.map((f) => {
          const active = value === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => selectField(f)}
              className={`flex w-full flex-col items-start border-l-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-muted)] ${
                active
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                  : "border-transparent"
              }`}
            >
              <span className="font-medium">{f.field_name}</span>
              <span className="font-mono text-xs text-[var(--color-muted-foreground)]">
                {f.field_code} · {f.data_type}
                {f.is_required ? ` · ${t("common.required")}` : ""}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-3 text-sm text-[var(--color-muted-foreground)]">
            {t("annotator.noMatchingField")}
          </p>
        )}
      </div>
    </div>
  );
}
