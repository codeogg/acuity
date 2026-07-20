// Localized empty-state wrapper around the design-kit EmptyState — filtered vs
// first-run variants are the caller's choice of copy; first-run may carry a
// CTA action. Server component.

import type { ReactNode } from "react";
import { EmptyState } from "@acuity/ui";
import { AcuityIcon, type AcuityIconName } from "@acuity/ui";

export function Empty({
  icon,
  title,
  description,
  action,
}: {
  icon: AcuityIconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-16">
      <EmptyState icon={<AcuityIcon name={icon} size={28} />} title={title} description={description} />
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
