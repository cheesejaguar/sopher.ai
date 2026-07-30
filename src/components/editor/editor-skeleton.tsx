import { Skeleton } from "@/components/ui/skeleton";

/** Designed loading state while the editor island streams in. */
export function EditorSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading editor"
      className="instrument-surface flex h-[calc(100dvh-13rem)] min-h-[480px] overflow-hidden max-xl:flex-col max-md:fixed max-md:inset-0 max-md:z-[45] max-md:h-dvh max-md:min-h-0 max-md:rounded-none max-md:border-0"
    >
      <div className="safe-area-top flex min-h-14 shrink-0 items-center gap-3 border-b border-border px-3 xl:hidden">
        <Skeleton className="size-11 rounded-sm" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-3.5 w-40 max-w-full" />
        </div>
        <Skeleton className="h-3 w-14" />
      </div>
      <div className="hidden w-56 shrink-0 space-y-3 border-r border-border p-4 xl:block">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
      <div className="instrument-canvas flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-hidden p-8 max-md:bg-paper max-md:p-0">
        <div className="manuscript-sheet w-full max-w-[75ch] space-y-4 px-10 py-14 max-md:min-h-full max-md:rounded-none max-md:border-0 max-md:px-5 max-md:py-8 max-md:shadow-none">
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
      <div className="safe-area-bottom flex min-h-14 shrink-0 items-center justify-around border-t border-border px-1 xl:hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="size-11 rounded-sm" />
        ))}
      </div>
    </div>
  );
}
