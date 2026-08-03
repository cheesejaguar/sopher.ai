import "server-only";

import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";

import { getDb, schema, withDbTransaction } from "@/db";
import type { AuthoringOnboarding } from "@/db/schema";
import {
  AUTHORING_ONBOARDING_VERSION,
  type AuthoringChecklistStep,
  type AuthoringOnboardingPreferences,
  type AuthoringOnboardingSnapshot,
  type AuthoringOnboardingUpdate,
} from "@/lib/authoring-onboarding-shared";
import { fullBookSetupHref, fullBookUnlockHref } from "@/lib/marketing/trial-offer";
import { validFullBookCompletionExistsSql } from "@/lib/run-completion-proof";

export const AUTHORING_COACHMARKS = [
  "mobile_navigation",
  "editor_autosave",
  "selection_tools",
] as const;

type ChecklistFacts = {
  preferences: AuthoringOnboarding;
  project: {
    id: string;
    experience: "trial_short_story" | "full_book";
  } | null;
  shapedIdea: boolean;
  startedProduction: boolean;
  reviewedOutline: boolean;
  watchedChapters: boolean;
  editedManuscript: boolean;
  readOrExported: boolean;
  includedStoryCompleted: boolean;
  fullBookUnlocked: boolean;
  continuedFullLength: boolean;
};

export function deriveProductionChecklistMilestones(
  projects: Array<{ id: string; experience: "trial_short_story" | "full_book" }>,
  productionProjectIds: Iterable<string>,
): { startedProduction: boolean; continuedFullLength: boolean } {
  const evidenced = new Set(productionProjectIds);
  return {
    startedProduction: evidenced.size > 0,
    continuedFullLength: projects.some(
      (project) => project.experience === "full_book" && evidenced.has(project.id),
    ),
  };
}

function normalizePreferences(preferences?: AuthoringOnboarding): AuthoringOnboardingPreferences {
  const current = preferences?.version === AUTHORING_ONBOARDING_VERSION;
  return {
    version: AUTHORING_ONBOARDING_VERSION,
    dismissed: current && Boolean(preferences.dismissedAt),
    seenCoachmarks: current ? (preferences.seenCoachmarks ?? []) : [],
  };
}

function projectHref(projectId: string, destination: string): string {
  return `/projects/${projectId}/${destination}`;
}

export function deriveAuthoringOnboardingSnapshot(
  facts: ChecklistFacts,
): AuthoringOnboardingSnapshot {
  const project = facts.project;
  const startHref = project ? projectHref(project.id, "write") : "/studio/new";
  const unfinishedIncludedStory =
    project?.experience === "trial_short_story" && !facts.includedStoryCompleted;
  const fullLengthHref = unfinishedIncludedStory
    ? startHref
    : project
      ? facts.fullBookUnlocked
        ? fullBookSetupHref(project.id)
        : fullBookUnlockHref(project.id)
      : facts.fullBookUnlocked
        ? "/studio/new"
        : "/studio/credits?return=%2Fstudio%2Fnew";

  const steps: AuthoringChecklistStep[] = [
    {
      id: "shape_idea",
      label: "Shape your idea",
      description: "Give the story a working title, genre, and brief.",
      complete: facts.shapedIdea,
      href: project ? projectHref(project.id, "brief") : "/studio/new",
    },
    {
      id: "start_production",
      label: "Start production",
      description: "Review the plan, then send the brief to the writing room.",
      complete: facts.startedProduction,
      href: startHref,
    },
    {
      id: "review_outline",
      label: "Review the outline",
      description: "Approve the story plan or request changes before chapter drafting.",
      complete: facts.reviewedOutline,
      href: project ? projectHref(project.id, "outline") : startHref,
    },
    {
      id: "watch_chapters",
      label: "Watch the chapters arrive",
      description: "Follow real production progress and see saved work take shape.",
      complete: facts.watchedChapters,
      href: startHref,
    },
    {
      id: "edit_manuscript",
      label: "Make the manuscript yours",
      description: "Edit the prose directly or review an editorial suggestion.",
      complete: facts.editedManuscript,
      href: project ? projectHref(project.id, "editor") : startHref,
    },
    {
      id: "read_or_export",
      label: "Read or export",
      description: "Open the continuous manuscript and download a finished copy.",
      complete: facts.readOrExported,
      href: project ? projectHref(project.id, "manuscript") : startHref,
    },
    {
      id: "continue_full_length",
      label: "Continue at full length",
      description: unfinishedIncludedStory
        ? "Finish your included story first. Then its title, genre, and brief can carry into a full-length setup."
        : project?.experience === "trial_short_story"
          ? "Carry this story’s title, genre, and brief into a new full-length setup."
          : "Start the next full-length production when you are ready.",
      complete: facts.continuedFullLength,
      href: fullLengthHref,
    },
  ];

  return {
    ...normalizePreferences(facts.preferences),
    completedCount: steps.filter((step) => step.complete).length,
    steps,
  };
}

export async function getAuthoringOnboardingPreferences(
  userId: string,
): Promise<AuthoringOnboardingPreferences> {
  const [user] = await getDb()
    .select({ preferences: schema.users.authoringOnboarding })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return normalizePreferences(user?.preferences);
}

export async function getAuthoringOnboardingSnapshot(
  userId: string,
): Promise<AuthoringOnboardingSnapshot> {
  const db = getDb();
  const [[user], projects] = await Promise.all([
    db
      .select({
        role: schema.users.role,
        preferences: schema.users.authoringOnboarding,
      })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1),
    db
      .select({
        id: schema.projects.id,
        experience: schema.projects.experience,
        brief: schema.projects.brief,
        status: schema.projects.status,
        completionArtifactsReady: validFullBookCompletionExistsSql(sql.raw('"projects"."id"')),
      })
      .from(schema.projects)
      .where(eq(schema.projects.userId, userId))
      .orderBy(
        sql`case when ${schema.projects.status} = 'archived' then 1 else 0 end`,
        desc(schema.projects.updatedAt),
      ),
  ]);

  const activeProjects = projects.filter((candidate) => candidate.status !== "archived");
  const project =
    activeProjects.find((candidate) => candidate.experience === "trial_short_story") ??
    activeProjects[0] ??
    projects[0] ??
    null;
  const projectIds = projects.map((candidate) => candidate.id);
  const empty = Promise.resolve([] as Array<{ id: string }>);

  const [
    productionRows,
    outlineInputRows,
    savedChapterRows,
    manualRevisionRows,
    appliedSuggestionRows,
    exportRows,
    purchaseRows,
  ] = await Promise.all([
    db
      .select({ projectId: schema.generationRuns.projectId })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.userId, userId),
          eq(schema.generationRuns.kind, "full_book"),
          sql`(
            exists (
              select 1
              from ${schema.generationEvents} onboarding_event
              where onboarding_event.run_id = ${schema.generationRuns.id}
                and (
                  onboarding_event.type in ('agent', 'chapter', 'review', 'tool_mutation')
                  or (
                    onboarding_event.type = 'stage'
                    and onboarding_event.payload->>'stage' <> 'queued'
                  )
                )
            )
            or exists (
              select 1
              from ${schema.llmCalls} onboarding_call
              where onboarding_call.run_id = ${schema.generationRuns.id}
            )
          )`,
        ),
      )
      .groupBy(schema.generationRuns.projectId),
    projectIds.length === 0
      ? empty
      : db
          .select({ id: schema.authoringRunInputs.id })
          .from(schema.authoringRunInputs)
          .innerJoin(
            schema.generationRuns,
            eq(schema.generationRuns.id, schema.authoringRunInputs.runId),
          )
          .where(
            and(
              eq(schema.generationRuns.userId, userId),
              eq(schema.authoringRunInputs.kind, "outline_approval"),
            ),
          )
          .limit(1),
    projectIds.length === 0
      ? empty
      : db
          .select({ id: schema.chapters.id })
          .from(schema.chapters)
          .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
          .where(and(inArray(schema.books.projectId, projectIds), gt(schema.chapters.wordCount, 0)))
          .limit(1),
    projectIds.length === 0
      ? empty
      : db
          .select({ id: schema.chapterRevisions.id })
          .from(schema.chapterRevisions)
          .innerJoin(schema.chapters, eq(schema.chapters.id, schema.chapterRevisions.chapterId))
          .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
          .where(
            and(
              inArray(schema.books.projectId, projectIds),
              eq(schema.chapterRevisions.source, "user"),
            ),
          )
          .limit(1),
    projectIds.length === 0
      ? empty
      : db
          .select({ id: schema.suggestions.id })
          .from(schema.suggestions)
          .innerJoin(schema.chapters, eq(schema.chapters.id, schema.suggestions.chapterId))
          .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
          .where(
            and(
              inArray(schema.books.projectId, projectIds),
              eq(schema.suggestions.status, "applied"),
            ),
          )
          .limit(1),
    projectIds.length === 0
      ? empty
      : db
          .select({ id: schema.assets.id })
          .from(schema.assets)
          .where(
            and(
              inArray(schema.assets.projectId, projectIds),
              inArray(schema.assets.kind, [
                "export_epub",
                "export_pdf",
                "export_docx",
                "export_md",
              ]),
            ),
          )
          .limit(1),
    db
      .select({ id: schema.creditLedger.id })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.userId, userId),
          eq(schema.creditLedger.kind, "purchase"),
          gt(schema.creditLedger.amount, "0"),
        ),
      )
      .limit(1),
  ]);

  const hasSavedChapter = savedChapterRows.length > 0;
  const completedProject = projects.some((candidate) => candidate.completionArtifactsReady);
  const productionMilestones = deriveProductionChecklistMilestones(
    projects,
    productionRows.map((run) => run.projectId),
  );

  return deriveAuthoringOnboardingSnapshot({
    preferences: user?.preferences ?? {
      version: AUTHORING_ONBOARDING_VERSION,
      seenCoachmarks: [],
    },
    project,
    shapedIdea: projects.some((candidate) => (candidate.brief?.trim().length ?? 0) > 0),
    startedProduction: productionMilestones.startedProduction,
    reviewedOutline: outlineInputRows.length > 0 || hasSavedChapter,
    watchedChapters: hasSavedChapter,
    editedManuscript: manualRevisionRows.length > 0 || appliedSuggestionRows.length > 0,
    readOrExported: completedProject || exportRows.length > 0,
    includedStoryCompleted: projects.some(
      (candidate) =>
        candidate.experience === "trial_short_story" && candidate.completionArtifactsReady,
    ),
    fullBookUnlocked: user?.role === "admin" || purchaseRows.length > 0,
    continuedFullLength: productionMilestones.continuedFullLength,
  });
}

export async function updateAuthoringOnboarding(
  userId: string,
  update: AuthoringOnboardingUpdate,
): Promise<AuthoringOnboardingSnapshot> {
  await withDbTransaction(async (tx) => {
    const [user] = await tx
      .select({ preferences: schema.users.authoringOnboarding })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1)
      .for("update");
    if (!user) throw new Error("User not found");

    const current =
      user.preferences.version === AUTHORING_ONBOARDING_VERSION
        ? user.preferences
        : { version: AUTHORING_ONBOARDING_VERSION, seenCoachmarks: [] };
    let next: AuthoringOnboarding;
    if (update.action === "dismiss_checklist") {
      next = {
        ...current,
        ...(update.dismissed ? { dismissedAt: new Date().toISOString() } : {}),
      };
      if (!update.dismissed) delete next.dismissedAt;
    } else {
      const seen = new Set(current.seenCoachmarks ?? []);
      seen.add(update.coachmark);
      next = { ...current, seenCoachmarks: [...seen] };
    }

    await tx
      .update(schema.users)
      .set({ authoringOnboarding: next, updatedAt: new Date() })
      .where(eq(schema.users.id, userId));
  });

  return getAuthoringOnboardingSnapshot(userId);
}
