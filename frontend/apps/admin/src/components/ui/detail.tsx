// Detail-view presentation helpers — key/value rows and facet sections used
// inside entity detail pages (clinic, doctor, company, template). Server
// components. A KeyVal is a label/value pair separated by a hairline; a
// FacetSection is an eyebrow-titled group.

import type { ReactNode } from "react";

export function KeyVal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2.5 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{children}</span>
    </div>
  );
}

export function FacetSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function DetailHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-6">
      <div className="mb-1 font-mono text-xs font-medium uppercase tracking-eyebrow text-muted-foreground">
        {eyebrow}
      </div>
      <h1 className="m-0 font-title text-3xl font-semibold leading-tight text-foreground">
        {title}
      </h1>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
