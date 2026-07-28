import { Skeleton } from "@/components/ui/skeleton";

export default function ProjectLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-5 w-28 rounded-4xl" />
        <Skeleton className="h-5 w-20 rounded-4xl" />
      </div>
      <Skeleton className="h-9 w-full max-w-md rounded-lg" />
      <div className="flex items-start gap-8">
        <div className="hidden flex-col gap-1 lg:flex" aria-hidden="true">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-10 rounded-[3px]" />
          ))}
        </div>
        <div className="flex-1 space-y-3 rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
