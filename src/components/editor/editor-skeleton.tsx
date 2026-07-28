import { Skeleton } from "@/components/ui/skeleton";

/** Designed loading state while the editor island streams in. */
export function EditorSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading editor"
      className="flex h-[calc(100dvh-13rem)] min-h-[480px] overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="hidden w-56 shrink-0 space-y-3 border-r border-border p-4 xl:block">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="flex min-w-0 flex-1 items-start justify-center overflow-hidden p-8">
        <div className="paper-surface w-full max-w-[75ch] space-y-4 px-10 py-14">
          <Skeleton className="h-7 w-2/3 bg-paper-edge/60" />
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-4 bg-paper-edge/60"
              style={{ width: `${[98, 92, 96, 88, 94, 90, 97, 85, 93, 91, 96, 60][i]}%` }}
            />
          ))}
        </div>
      </div>
      <div className="hidden w-72 shrink-0 space-y-3 border-l border-border p-4 xl:block">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
