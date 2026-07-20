"use client";

import type { ClaimOut } from "@acuity/types";
import { cn } from "@acuity/ui";
import {
  getTemplateFieldSchema,
  type FieldSchemaEntry,
} from "@acuity/api-client/mocks/fixtures";
import { useCatalog } from "@/lib/catalog";
import { latinPart } from "@acuity/i18n/names";

// The insurer-form facsimile: a faithful, stylised recreation of the insurer's
// printed paper form (review.md / matrix 4.5.3), driven by the template field
// schema — bilingual letterhead, lettered sections in stored order, dotted
// value rows, comb (character-box) cells, checkbox rows, and the signature
// line. Reused by the review preview (unsigned) and the produce render
// (signed). The palette + print metrics are the PAPER's own (.facsimile
// classes in globals.css), not app chrome; the paper is deliberately
// locale-independent (the insurer's bilingual document, whatever the UI
// language).

const SECTION_LETTERS = "ABCDEFGH";

export function InsurerFormFacsimile({
  claim,
  values,
  signed,
  signatureName,
  signatureImageUrl,
  fieldAnchorPrefix,
}: {
  claim: ClaimOut;
  /** Live field values (local edits merged over the server claim). */
  values: Record<string, string>;
  /** Whether the signature on file is applied (produce) or blank (review). */
  signed: boolean;
  /** The doctor's signature label when no image is on file. */
  signatureName?: string;
  /** The uploaded signature image (settings), applied when signed. */
  signatureImageUrl?: string | null;
  /** When set, each row carries id={prefix}-{field_code} for linked scroll. */
  fieldAnchorPrefix?: string;
}) {
  const catalog = useCatalog();
  const schema = getTemplateFieldSchema(claim.template_id);

  const companyEn = catalog.companyName(claim.company_id, "en-HK");
  const companyZh = catalog.companyName(claim.company_id, "zh-Hant-HK");
  const formEn = catalog.formName(claim.template_id, "en-HK");
  const formZh = catalog.formName(claim.template_id, "zh-Hant-HK");

  const categories = schema.categories.slice().sort((a, b) => a.order - b.order);

  return (
    <div className="facsimile font-serif shadow-sm">
      {/* Bilingual letterhead */}
      <div className="facsimile-letterhead">
        {/* h2 keeps the facsimile inside the page's heading outline (h1 page
            title → h2 letterhead → h3 sections). */}
        <h2 className="facsimile-letterhead-title">{companyEn || formEn}</h2>
        <p className="facsimile-letterhead-sub">
          {companyZh} · {formEn} / {formZh}
        </p>
      </div>

      {categories.map((category, index) => {
        const fields = schema.fields
          .filter((f) => f.category_code === category.code && f.data_type !== "signature")
          .sort((a, b) => a.order - b.order);
        if (fields.length === 0) return null;
        return (
          <section key={category.code}>
            <h3 className="facsimile-section-title">
              {SECTION_LETTERS[index] ?? "•"}. {category.label_en} {category.label_zh}
            </h3>
            {fields.map((field) => (
              <FacsimileRow
                key={field.field_code}
                field={field}
                value={values[field.field_code] ?? ""}
                anchorId={
                  fieldAnchorPrefix
                    ? `${fieldAnchorPrefix}-${field.field_code}`
                    : undefined
                }
              />
            ))}
          </section>
        );
      })}

      {/* Signature line + form footer */}
      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <div className="facsimile-signature-line">
            {signed &&
              (signatureImageUrl ? (
                /* A data-URL signature from settings, not an optimisable asset. */
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signatureImageUrl}
                  alt=""
                  className="max-h-7 max-w-full object-contain"
                />
              ) : (
                <span className="facsimile-signature-name font-title">
                  {signatureName ? latinPart(signatureName) || signatureName : ""}
                </span>
              ))}
          </div>
          <p className="facsimile-signature-caption">
            Attending physician signature 主診醫生簽署
          </p>
        </div>
        <p className="facsimile-footer-ref">
          {formEn}
          {claim.template_version ? ` · ${claim.template_version}` : ""}
        </p>
      </div>
    </div>
  );
}

function FacsimileRow({
  field,
  value,
  anchorId,
}: {
  field: FieldSchemaEntry;
  value: string;
  anchorId?: string;
}) {
  const label = (
    <span className="facsimile-label">
      {field.label_en} {field.label_zh}
    </span>
  );

  if (field.render?.shape === "comb") {
    const length = field.render.comb_length ?? 8;
    const chars = value.replace(/[^0-9A-Za-z]/g, "").slice(0, length).split("");
    return (
      <div id={anchorId} className="facsimile-row">
        {label}
        <span className="facsimile-comb">
          {Array.from({ length }, (_, i) => (
            <span key={i} className="facsimile-comb-cell">
              {chars[i] ?? ""}
            </span>
          ))}
        </span>
      </div>
    );
  }

  if (field.render?.shape === "checkbox-row" && field.render.options) {
    return (
      <div id={anchorId} className="facsimile-row">
        {label}
        <span className="facsimile-checkbox-row">
          {field.render.options.map((option) => {
            // Match "男" against "男 M"-style option labels (stored values may
            // carry either form).
            const checked =
              value !== "" &&
              (option === value ||
                option.split(/\s+/).includes(value) ||
                value.split(/\s+/).some((v) => v !== "" && option.includes(v)));
            return (
              <span key={option} className="facsimile-checkbox">
                <span className="facsimile-checkbox-box">{checked ? "✓" : ""}</span>
                {option}
              </span>
            );
          })}
        </span>
      </div>
    );
  }

  const display = formatFacsimileValue(field, value);
  return (
    <div id={anchorId} className="facsimile-row">
      {label}
      <span className={cn("facsimile-value", !display && "facsimile-value-empty")}>
        {display}
      </span>
    </div>
  );
}

// Dates print in the paper form's day / month / year register; everything else
// prints verbatim (field data keeps its own locale, independent of the UI).
function formatFacsimileValue(field: FieldSchemaEntry, value: string): string {
  if (!value) return "";
  if (field.data_type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day} / ${month} / ${year}`;
  }
  return value;
}
