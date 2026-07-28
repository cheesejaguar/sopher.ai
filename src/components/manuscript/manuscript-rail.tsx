"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";

import { FolioRail, type FolioRailChapter } from "@/components/studio/folio-rail";

/**
 * Horizontal folio strip for the reading view — selecting a segment swaps the
 * ?chapter searchParam so the server re-renders the requested chapter.
 */
export function ManuscriptRail({
  projectId,
  chapters,
  activeChapter,
}: {
  projectId: string;
  chapters: FolioRailChapter[];
  activeChapter: number;
}) {
  const router = useRouter();
  return (
    <FolioRail
      chapters={chapters}
      activeChapter={activeChapter}
      orientation="horizontal"
      onSelect={(n) => router.push(`/projects/${projectId}/manuscript?chapter=${n}` as Route)}
    />
  );
}
