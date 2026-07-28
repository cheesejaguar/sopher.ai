import type { Metadata } from "next";
import { Suspense } from "react";

import { estimateBookCost } from "@/ai/estimate";
import { EmptyLibrary } from "@/components/studio/empty-library";
import { NewBookCard, ProjectCard, type ProjectCardData } from "@/components/studio/project-card";
import { listProjectsWithStats } from "@/db/queries/projects";
import { requireUser } from "@/lib/auth";
import { ProjectGridSkeleton } from "./loading";

export const metadata: Metadata = {
  title: "Your books",
};

async function ProjectGrid() {
  const { userId } = await requireUser();
  const projects = await listProjectsWithStats(userId);

  if (projects.length === 0) {
    return <EmptyLibrary />;
  }

  const cards: ProjectCardData[] = projects.map((project) => ({
    id: project.id,
    title: project.title,
    genre: project.genre,
    status: project.status === "archived" ? "draft" : project.status,
    updatedAt: project.updatedAt.toISOString(),
    wordCount: project.wordCount,
    chaptersDone: project.chaptersDone,
    chaptersTotal: project.chaptersTotal,
    spendUsd: project.spendUsd,
    estimateUsd: estimateBookCost(
      project.settings.qualityTier ?? "standard",
      project.targetChapters,
      project.targetWordsPerChapter,
    ).totalUsd,
  }));

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <ProjectCard key={card.id} project={card} />
      ))}
      <NewBookCard />
    </div>
  );
}

export default function StudioPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Your books</h1>
        <p className="text-sm text-muted-foreground">
          Every manuscript starts as a brief. Pick up where you left off.
        </p>
      </header>

      <Suspense fallback={<ProjectGridSkeleton />}>
        <ProjectGrid />
      </Suspense>
    </div>
  );
}
