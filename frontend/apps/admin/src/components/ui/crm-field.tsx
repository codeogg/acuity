"use client";

// CRM-lite editable field row — input / select / textarea committing through a
// server action on change (selects) or blur (text). Routine edits stay quiet
// (autosave register); consequential ones route through the confirm gate at
// the call site instead.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@acuity/ui";
import { useToast } from "@acuity/ui";
import type { ActionResult } from "@/lib/actions";

export function CrmFieldRow({
  label,
  value,
  options,
  multiline = false,
  commit,
  successMessage,
}: {
  label: string;
  value: string;
  options?: { value: string; label: string }[];
  multiline?: boolean;
  commit: (next: string) => Promise<ActionResult<unknown>>;
  successMessage?: string;
}) {
  const [draft, setDraft] = useState(value);
  const [, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();

  function save(next: string) {
    if (next === value) return;
    startTransition(async () => {
      const result = await commit(next);
      if (result.ok) {
        if (successMessage) showToast(successMessage);
        router.refresh();
      } else {
        showToast(result.message, "error");
        setDraft(value);
      }
    });
  }

  return (
    <div className="mb-3.5">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">{label}</label>
      {options ? (
        <Select
          value={draft}
          onValueChange={(next) => {
            setDraft(next);
            save(next);
          }}
        >
          <SelectTrigger aria-label={label} className="h-9 w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : multiline ? (
        <Textarea
          value={draft}
          rows={3}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save(draft)}
        />
      ) : (
        <Input
          value={draft}
          aria-label={label}
          className="h-9"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save(draft)}
        />
      )}
    </div>
  );
}
