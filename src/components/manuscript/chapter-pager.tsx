import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type PagerChapter = { number: number; title: string };

/** Prev/next links at the foot of the reading view. Server-renderable. */
export function ChapterPager({
  projectId,
  previous,
  next,
}: {
  projectId: string;
  previous: PagerChapter | null;
  next: PagerChapter | null;
}) {
  if (!previous && !next) return null;
  return (
    <nav aria-label="Chapter pagination" className="flex items-center justify-between gap-3">
      {previous ? (
        <Link
          href={`/projects/${projectId}/manuscript?chapter=${previous.number}` as Route}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-w-[45%]")}
        >
          <ChevronLeft aria-hidden="true" data-icon="inline-start" />
          <span className="sr-only">Previous chapter: </span>
          <span className="truncate">{previous.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
      {next ? (
        <Link
          href={`/projects/${projectId}/manuscript?chapter=${next.number}` as Route}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "max-w-[45%]")}
        >
          <span className="sr-only">Next chapter: </span>
          <span className="truncate">{next.title}</span>
          <ChevronRight aria-hidden="true" data-icon="inline-end" />
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
