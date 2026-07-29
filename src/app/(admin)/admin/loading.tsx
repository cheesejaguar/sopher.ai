import { Skeleton } from "@/components/ui/skeleton";

/** Suspense boundary for every admin page (cacheComponents requires one). */
export default function AdminLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
