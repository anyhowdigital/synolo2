export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex min-w-0 flex-col gap-3 md:flex-row md:items-start md:justify-between" data-testid="page-header">
      <div className="min-w-0 break-words">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="page-title">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground" data-testid="page-description">{description}</p> : null}
      </div>
      {children ? <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid="page-actions">{children}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center break-words" data-testid="empty-state">
      <h3 className="text-base font-medium">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
