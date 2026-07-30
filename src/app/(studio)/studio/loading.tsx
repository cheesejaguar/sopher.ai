import { Skeleton } from "@/components/ui/skeleton";

function ProjectCardSkeleton({ featured = false }: { featured?: boolean }) {
  return (
    <div
      className={
        featured
          ? "instrument-surface-raised grid min-h-64 gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:p-7"
          : "instrument-surface flex min-h-56 flex-col p-5"
      }
    >
      <div className="flex min-w-0 flex-col">
        <div>
          <Skeleton className={featured ? "h-7 w-2/3" : "h-5 w-3/4"} />
          <div className="mt-3 flex items-center gap-2">
            <Skeleton className="h-5 w-24 rounded-sm" />
            <Skeleton className="h-5 w-16 rounded-sm" />
          </div>
        </div>
        <div className="mt-auto space-y-3 pt-8">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-1 w-full rounded-none" />
          <div className="flex gap-1" aria-hidden="true">
            {Array.from({ length: 10 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-4 rounded-[2px]" />
            ))}
          </div>
        </div>
      </div>
      {featured ? (
        <div className="manuscript-sheet hidden min-h-44 p-4 sm:block">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="mt-7 h-4 w-3/4" />
          <Skeleton className="mt-3 h-2 w-full" />
          <Skeleton className="mt-2 h-2 w-5/6" />
          <Skeleton className="mt-2 h-2 w-4/5" />
        </div>
      ) : (
        <div className="flex justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-20" />
        </div>
      )}
    </div>
  );
}

export function ProjectGridSkeleton() {
  return (
    <>
      {/* Skeletons are silent to assistive tech — announce the wait instead. */}
      <p role="status" className="sr-only">
        Loading your books…
      </p>
      <div className="space-y-9" aria-hidden="true">
        <section className="space-y-3">
          <Skeleton className="h-3 w-48" />
          <ProjectCardSkeleton featured />
        </section>
        <section className="space-y-4">
          <Skeleton className="h-6 w-24" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <ProjectCardSkeleton />
            <ProjectCardSkeleton />
            <div className="instrument-surface flex min-h-56 items-center justify-center border-dashed">
              <Skeleton className="size-11 rounded-sm" />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

export default function StudioDashboardLoading() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-72" />
      </header>
      <ProjectGridSkeleton />
    </div>
  );
}
