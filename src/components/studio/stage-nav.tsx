"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

import { cn } from "@/lib/utils";

const stages = [
  { slug: "brief", label: "Brief" },
  { slug: "outline", label: "Outline" },
  { slug: "bible", label: "Bible" },
  { slug: "write", label: "Write" },
  { slug: "editor", label: "Editor" },
  { slug: "manuscript", label: "Manuscript" },
  { slug: "usage", label: "Usage" },
] as const;

function StageTabs({ projectId, pathname }: { projectId: string; pathname?: string }) {
  return (
    <div className="flex w-fit items-center gap-1 rounded-lg bg-muted p-1">
      {stages.map((stage) => {
        const href = `/projects/${projectId}/${stage.slug}` as const;
        // `"page"` only for the exact route. A nested route such as
        // /editor/3 is inside the stage but is not the tab's own page, so it
        // gets the generic `"true"` rather than mislabelling the location.
        const current =
          pathname === undefined
            ? undefined
            : pathname === href
              ? "page"
              : pathname.startsWith(`${href}/`)
                ? "true"
                : undefined;
        const active = current !== undefined;
        return (
          <Link
            key={stage.slug}
            href={href}
            aria-current={current}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-background text-foreground shadow-sm dark:bg-input/30"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {stage.label}
          </Link>
        );
      })}
    </div>
  );
}

function StageTabsWithPathname({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return <StageTabs projectId={projectId} pathname={pathname} />;
}

export function StageNav({ projectId }: { projectId: string }) {
  return (
    <nav aria-label="Workspace stages" className="max-w-full overflow-x-auto">
      <Suspense fallback={<StageTabs projectId={projectId} />}>
        <StageTabsWithPathname projectId={projectId} />
      </Suspense>
    </nav>
  );
}
