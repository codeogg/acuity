export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string | undefined;
  action?: React.ReactNode | undefined;
}) {
  return (
    <div className="mb-6 flex items-start justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--color-muted-foreground)]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
