"use client";

// Searchable standard-field picker (ported from legacy annotator).

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Input } from "@acuity/ui";

export interface StandardFieldOption {
  id: number;
  field_code: string;
  field_name: string;
  data_type: string;
  is_required?: boolean;
}

export function StandardFieldPicker({
  fields,
  value,
  onChange,
}: {
  fields: StandardFieldOption[];
  value: number | null;
  onChange: (id: number | null) => void;
}) {
  const t = useTranslations("editor.annotate");
  const [keyword, setKeyword] = useState("");

  const selected = useMemo(
    () => (value ? (fields.find((f) => f.id === value) ?? null) : null),
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          readOnly
          value={
            selected
              ? `${selected.field_code} · ${selected.field_name}（${selected.data_type}）`
              : ""
          }
          placeholder={t("select-standard")}
          className={selected ? "border-primary bg-muted/40" : ""}
        />
        {selected ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onChange(null);
              setKeyword("");
            }}
          >
            {t("clear")}
          </Button>
        ) : null}
      </div>
      <Input
        placeholder={t("search-standard")}
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
      />
      <div className="max-h-56 overflow-auto rounded-lg border border-border">
        {filtered.map((f) => {
          const active = value === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                onChange(f.id);
                setKeyword("");
              }}
              className={`flex w-full flex-col items-start border-l-2 px-3 py-2 text-left text-sm hover:bg-accent ${
                active ? "border-primary bg-primary/10" : "border-transparent"
              }`}
            >
              <span className="font-medium text-foreground">{f.field_name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                {f.field_code} · {f.data_type}
                {f.is_required ? ` · ${t("required")}` : ""}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{t("no-matching-field")}</p>
        ) : null}
      </div>
    </div>
  );
}
