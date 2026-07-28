import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function ProjectCardSkeleton() {
  return (
    <Card className="h-full">
      <CardHeader>
        <Skeleton className="h-5 w-3/4" />
        <div className="mt-1 flex items-center gap-1.5">
          <Skeleton className="h-5 w-24 rounded-4xl" />
          <Skeleton className="h-5 w-16 rounded-4xl" />
        </div>
      </CardHeader>
      <CardContent className="mt-auto space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-1 w-full rounded-full" />
        {/* folio strip */}
        <div className="flex gap-1 pt-1" aria-hidden="true">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-4 rounded-[2px]" />
          ))}
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </CardFooter>
    </Card>
  );
}

export function ProjectGridSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
      <ProjectCardSkeleton />
      <div className="flex min-h-44 items-center justify-center rounded-xl border border-dashed border-border">
        <Skeleton className="size-9 rounded-full" />
      </div>
    </div>
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
