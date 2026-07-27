import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { chapterStatusLabels, sampleChapters } from "@/lib/placeholder-data";

export default async function EditorIndexPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h2 className="font-display text-xl font-semibold tracking-tight">Editor</h2>
        <p className="text-sm text-muted-foreground">
          The editor opens on a chapter. Pick one to read it with suggestions in the margin.
        </p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {sampleChapters.map((chapter) => {
          const editable = chapter.status !== "planned";
          const inner = (
            <>
              <span className="w-6 shrink-0 text-right font-mono text-sm text-muted-foreground tabular-nums">
                {chapter.number}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{chapter.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {editable ? chapterStatusLabels[chapter.status] : "not drafted yet"}
                </span>
              </span>
              {editable ? (
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-muted-foreground"
                />
              ) : null}
            </>
          );
          const itemClasses =
            "flex items-center gap-3 rounded-xl bg-card px-4 py-3 ring-1 ring-foreground/10";
          return (
            <li key={chapter.number}>
              {editable ? (
                <Link
                  href={`/projects/${projectId}/editor/${chapter.number}`}
                  className={cn(itemClasses, "transition-shadow hover:ring-foreground/25")}
                >
                  {inner}
                </Link>
              ) : (
                <div className={cn(itemClasses, "opacity-60")}>{inner}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
