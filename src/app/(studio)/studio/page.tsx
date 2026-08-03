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
import { StudioInlineChecklist } from "@/components/studio/first-book-checklist";
import { listAuthoringJourneySnapshots } from "@/db/queries/authoring-journey";
import { requireUser } from "@/lib/auth";
import type { AuthoringJourneySnapshot } from "@/lib/authoring-journey";
import { getAuthoringOnboardingSnapshot } from "@/lib/authoring-onboarding";
import { getStudioAccess, shouldOfferFullBookUnlock } from "@/lib/studio-access";
import { getBalance } from "@/lib/billing/credits";
import { ProjectGridSkeleton } from "./loading";

export const metadata: Metadata = {
  title: "Your books",
};

function toCard(journey: AuthoringJourneySnapshot): ProjectCardData {
  const { project, artifacts } = journey;
  return {
    id: project.id,
    title: project.title,
    genre: project.genre,
    status: project.status,
    archived: project.status === "archived",
    updatedAt: project.updatedAt,
    wordCount: artifacts.wordCount,
    chaptersDone: artifacts.savedChapters,
    chaptersTotal: artifacts.totalChapters,
    creditsUsed: journey.spend.creditsUsed,
    estimateUsd: estimateBookCost(
      project.qualityTier,
      project.targetChapters,
      project.targetWordsPerChapter,
    ).totalUsd,
    nextAction: journey.nextAction,
  };
}

async function ProjectGrid() {
  const { userId } = await requireUser();
  const accessPromise = getStudioAccess(userId);
  const journeyAccessPromise = Promise.all([accessPromise, getBalance(userId)]).then(
    ([access, balanceCredits]) => ({ ...access, balanceCredits }),
  );
  const [projects, archived, access, onboarding] = await Promise.all([
    listAuthoringJourneySnapshots(userId, journeyAccessPromise),
    listAuthoringJourneySnapshots(userId, journeyAccessPromise, { archived: true }),
    accessPromise,
    getAuthoringOnboardingSnapshot(userId),
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
    return (
      <div className="space-y-8">
        <StudioInlineChecklist initialSnapshot={onboarding} />
        <EmptyLibrary mode={mode} />
      </div>
    );
  }

  const offerFullBookUnlock = shouldOfferFullBookUnlock(access);

  return (
    <>
      <StudioInlineChecklist initialSnapshot={onboarding} />
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
              <ProjectCard key={project.project.id} project={toCard(project)} />
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
              <ProjectCard key={project.project.id} project={toCard(project)} />
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
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
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
