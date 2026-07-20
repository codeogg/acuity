"use client";

import { parseDate } from "@internationalized/date";
import {
  DateInput,
  DatePicker,
  DateSegment,
  Group,
  Label,
} from "react-aria-components";

/**
 * 分段式日期输入（年/月/日独立输入），适配香港医疗录入场景与 a11y / IME。
 * value/onChange 使用 ISO 字符串 "YYYY-MM-DD"。
 */
export function AppDatePicker({
  value,
  onChange,
  label,
}: {
  value?: string;
  onChange: (isoDate: string) => void;
  label: string;
}) {
  return (
    <DatePicker
      value={value ? parseDate(value) : null}
      onChange={(date) => date && onChange(date.toString())}
      className="flex flex-col gap-1"
    >
      <Label className="text-sm font-medium">{label}</Label>
      <Group className="flex rounded-lg border border-[var(--color-input)] px-2 py-1.5">
        <DateInput>
          {(segment) => (
            <DateSegment segment={segment} className="px-0.5 tabular-nums outline-none" />
          )}
        </DateInput>
      </Group>
    </DatePicker>
  );
}
