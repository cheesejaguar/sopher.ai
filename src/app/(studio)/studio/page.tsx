import type { Metadata } from "next";
import { Suspense } from "react";

import { estimateBookCost } from "@/ai/estimate";
import { EmptyLibrary } from "@/components/studio/empty-library";
import { NewBookCard, ProjectCard, type ProjectCardData } from "@/components/studio/project-card";
import { listProjectsWithStats, type ProjectWithStats } from "@/db/queries/projects";
import { requireUser } from "@/lib/auth";
import { ProjectGridSkeleton } from "./loading";

export const metadata: Metadata = {
  title: "Your books",
};

function toCard(project: ProjectWithStats): ProjectCardData {
  return {
    id: project.id,
    title: project.title,
    genre: project.genre,
    status: project.status === "archived" ? "draft" : project.status,
    archived: project.status === "archived",
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
  };
}

async function ProjectGrid() {
  const { userId } = await requireUser();
  const [projects, archived] = await Promise.all([
    listProjectsWithStats(userId),
    listProjectsWithStats(userId, { archived: true }),
  ]);

  if (projects.length === 0 && archived.length === 0) {
    return <EmptyLibrary />;
  }

  return (
    <>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <ProjectCard key={project.id} project={toCard(project)} />
        ))}
        <NewBookCard />
      </div>

      {archived.length > 0 ? (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Archived · {archived.length}
          </summary>
          <div className="mt-4 grid gap-5 opacity-80 sm:grid-cols-2 lg:grid-cols-3">
            {archived.map((project) => (
              <ProjectCard key={project.id} project={toCard(project)} />
            ))}
          </div>
        </details>
      ) : null}
    </>
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
