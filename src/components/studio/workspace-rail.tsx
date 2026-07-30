"use client";

import { usePathname, useRouter } from "next/navigation";
import { Suspense } from "react";

import { FolioRail, type FolioRailChapter } from "@/components/studio/folio-rail";

function WorkspaceRailWithPathname({
  projectId,
  chapters,
}: {
  projectId: string;
  chapters: FolioRailChapter[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const surfaceOwnsChapterNavigation = /\/(?:editor|write|manuscript)(?:\/|$)/.test(pathname);

  if (surfaceOwnsChapterNavigation) return null;

  const match = pathname.match(/\/editor\/(\d+)(?:\/|$)/);
  const activeChapter = match ? Number(match[1]) : undefined;

  return (
    <aside aria-label="Chapter overview" className="hidden shrink-0 xl:block">
      <div className="sticky top-20 flex flex-col items-start gap-3">
        <span className="font-mono text-[10px] tracking-widest text-muted-foreground uppercase">
          Folio
        </span>
        <FolioRail
          chapters={chapters}
          activeChapter={activeChapter}
          orientation="vertical"
          onSelect={(n) => router.push(`/projects/${projectId}/editor/${n}`)}
        />
      </div>
    </aside>
  );
}

/**
 * The vertical chapter rail in the workspace. Derives the active chapter
 * from the URL and navigates to the editor when a segment is chosen.
 */
export function WorkspaceRail({
  projectId,
  chapters,
}: {
  projectId: string;
  chapters: FolioRailChapter[];
}) {
  return (
    <Suspense fallback={null}>
      <WorkspaceRailWithPathname projectId={projectId} chapters={chapters} />
    </Suspense>
  );
}
