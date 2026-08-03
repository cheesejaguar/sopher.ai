import type { ReactNode } from "react";
import { AlertTriangle, Inbox, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "grid gap-5 border-b border-border pb-6 sm:pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-balance [overflow-wrap:anywhere]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere] sm:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

const ASYNC_ICONS = {
  loading: LoaderCircle,
  empty: Inbox,
  error: AlertTriangle,
} as const;

export function AsyncState({
  status,
  title,
  description,
  action,
  compact = false,
  className,
  headingLevel,
}: {
  status: keyof typeof ASYNC_ICONS;
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
  headingLevel?: 1 | 2 | 3;
}) {
  const Icon = ASYNC_ICONS[status];
  return (
    <div
      role={status === "error" ? "alert" : status === "loading" ? "status" : undefined}
      className={cn(
        "flex flex-col items-center justify-center border border-border bg-card/35 px-5 text-center",
        compact ? "min-h-32 py-6" : "min-h-52 py-10",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          "size-5",
          status === "loading" && "animate-spin text-ai",
          status === "empty" && "text-muted-foreground",
          status === "error" && "text-destructive",
        )}
      />
      {headingLevel === 1 ? (
        <h1 className="mt-3 text-xl font-semibold tracking-[-0.02em]">{title}</h1>
      ) : headingLevel === 2 ? (
        <h2 className="mt-3 text-lg font-semibold tracking-[-0.02em]">{title}</h2>
      ) : headingLevel === 3 ? (
        <h3 className="mt-3 text-base font-semibold">{title}</h3>
      ) : (
        <p className="mt-3 text-sm font-semibold">{title}</p>
      )}
      {description ? (
        <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function CostDisplay({
  credits,
  usd,
  label = "Estimated cost",
  note,
  className,
  valueClassName,
}: {
  credits: number;
  usd?: number;
  label?: string;
  note?: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="folio-label text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-2 font-mono text-2xl font-semibold tracking-[-0.03em] tabular-nums",
          valueClassName,
        )}
      >
        {credits.toFixed(1)}
        <span className="ml-2 text-sm font-medium tracking-normal text-muted-foreground">
          credits
        </span>
      </p>
      {usd !== undefined ? (
        <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground tabular-nums">
          ${usd.toFixed(2)} metered model cost
        </p>
      ) : null}
      {note ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{note}</p> : null}
    </div>
  );
}

export function ResponsiveInspector({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside
      aria-label={title}
      className={cn(
        "instrument-surface min-w-0 space-y-4 rounded-sm p-4 xl:rounded-none xl:border-y-0 xl:border-r-0 xl:border-l xl:bg-transparent xl:py-0 xl:pr-0 xl:pl-5",
        className,
      )}
    >
      <div className="border-b border-border pb-3">
        <span className="folio-label text-muted-foreground">{title}</span>
        {description ? (
          <span className="mt-1 block text-xs font-normal text-muted-foreground">
            {description}
          </span>
        ) : null}
      </div>
      {children}
    </aside>
  );
}
