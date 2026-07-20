"use client";

// Operator markdown notes (dev ADR 0041) — shared editor for the clinic and
// doctor internal notes: rendered markdown at rest, textarea + live preview
// while editing, committed through a server action. react-markdown escapes
// raw HTML, so pasted content cannot inject markup.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Markdown from "react-markdown";
import { Button, Textarea } from "@acuity/ui";
import { AcuityIcon } from "@acuity/ui";
import { useToast } from "@acuity/ui";
import type { ActionResult } from "@/lib/actions";

const PROSE =
  "text-sm text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 " +
  "[&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 " +
  "[&_h1]:mb-1.5 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-1.5 [&_h2]:text-sm [&_h2]:font-semibold " +
  "[&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-medium [&_strong]:font-semibold " +
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs " +
  "[&_a]:text-primary [&_a]:underline " +
  "[&_blockquote]:mb-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground";

export function MarkdownNotes({
  value,
  commit,
}: {
  value: string;
  commit: (next: string) => Promise<ActionResult<unknown>>;
}) {
  const t = useTranslations("notes");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  function save() {
    startTransition(async () => {
      const result = await commit(draft);
      if (result.ok) {
        showToast(t("saved"));
        setEditing(false);
        router.refresh();
      } else {
        showToast(result.message, "error");
      }
    });
  }

  if (!editing) {
    return (
      <div>
        {value.trim() ? (
          <div className={PROSE} data-testid="notes-rendered">
            <Markdown>{value}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
        <div className="mt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            <AcuityIcon name="pencil" size={16} />
            {t("edit")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Textarea
        value={draft}
        rows={6}
        aria-label={t("edit")}
        placeholder={t("placeholder")}
        className="font-mono text-xs"
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="mt-3 rounded-md border border-border bg-muted/40 p-3">
        <div className="mb-1.5 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          {t("preview")}
        </div>
        {draft.trim() ? (
          <div className={PROSE} data-testid="notes-preview">
            <Markdown>{draft}</Markdown>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
          {t("cancel")}
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
