import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, BookPlus } from "lucide-react";

import { estimateBookCost } from "@/ai/estimate";
import { EmptyLibrary } from "@/components/studio/empty-library";
import {
  FeaturedProjectCard,
  NewBookCard,
  ProjectCard,
  type ProjectCardData,
} from "@/components/studio/project-card";
import { listProjectsWithStats, type ProjectWithStats } from "@/db/queries/projects";
import { requireUser } from "@/lib/auth";
import { getStudioAccess } from "@/lib/studio-access";
import { ProjectGridSkeleton } from "./loading";

export const metadata: Metadata = {
  title: "Your books",
};

function toCard(project: ProjectWithStats): ProjectCardData {
  return {
    id: project.id,
    title: project.title,
    genre: project.genre,
    status: project.status,
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
  const [projects, archived, access] = await Promise.all([
    listProjectsWithStats(userId),
    listProjectsWithStats(userId, { archived: true }),
    getStudioAccess(userId),
  ]);

  if (projects.length === 0 && archived.length === 0) {
    const mode =
      access.creationExperience === "trial_short_story"
        ? "included_story"
        : access.fullBookUnlocked
          ? "full_book"
          : access.reason === "verify_email"
            ? "verify_email"
            : "purchase_required";
    return <EmptyLibrary mode={mode} />;
  }

  const offerFullBookUnlock = !access.fullBookUnlocked && access.trialProjectId !== null;

  return (
    <>
      <div className="space-y-8">
        {projects[0] ? <FeaturedProjectCard project={toCard(projects[0])} /> : null}
        <section aria-labelledby="library-heading" className="space-y-4">
          <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
            <h2 id="library-heading" className="text-lg font-semibold tracking-[-0.02em]">
              Library
            </h2>
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {projects.length} active
            </span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {projects.slice(1).map((project) => (
              <ProjectCard key={project.id} project={toCard(project)} />
            ))}
            <NewBookCard
              unlockFullBooks={offerFullBookUnlock}
              sourceProjectId={access.trialProjectId ?? undefined}
            />
          </div>
        </section>
      </div>

      {archived.length > 0 ? (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
            Archived · {archived.length}
          </summary>
          <div className="mt-4 grid gap-4 opacity-80 md:grid-cols-2 2xl:grid-cols-3">
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
      <header className="grid gap-6 border-b border-border pb-7 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <p className="folio-label text-primary">Studio / Library</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
            Your books
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Every manuscript starts as a brief. Resume the active stage or begin a new production.
          </p>
        </div>
        <Link
          href="/studio/new"
          className="inline-flex min-h-11 w-fit items-center gap-2 rounded-sm bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <BookPlus aria-hidden="true" className="size-4" />
          Start a book
          <ArrowRight aria-hidden="true" className="size-3.5" />
        </Link>
      </header>

      <Suspense fallback={<ProjectGridSkeleton />}>
        <ProjectGrid />
      </Suspense>
    </div>
  );
}
