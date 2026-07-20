// Split skeleton mirroring the field-map editor (PDF pane + field list).
import { useTranslations } from "next-intl";
import { Shimmer } from "@acuity/ui";

export default function Loading() {
  const t = useTranslations("common");
  return (
    <div className="flex h-full flex-col" role="status" aria-label={t("loading")}>
      <div className="border-b border-border px-6 py-4">
        <Shimmer className="h-7 w-72" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="border-r border-border p-6" style={{ width: "56%" }}>
          <Shimmer className="mx-auto h-full w-full" />
        </div>
        <div className="flex-1 space-y-2.5 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Shimmer key={i} className="h-11 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
