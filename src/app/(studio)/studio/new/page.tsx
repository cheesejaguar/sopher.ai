import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { NewBookWizard } from "@/components/wizard/new-book-wizard";
import { ImportDialog } from "@/components/studio/import-dialog";
import type { WizardState } from "@/components/wizard/wizard-state";
import { GENRE_IDS, type GenreId } from "@/ai/knowledge/genres";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";
import { projectCarryForwardSetup } from "@/lib/project-carry-forward";
import { getStudioAccess } from "@/lib/studio-access";
import { clerkEnabled } from "@/lib/clerk";

export const metadata: Metadata = {
  title: "A new book",
};

/**
 * The genre landing pages link here with ?genre=, so someone who arrived from a
 * search for "write a fantasy novel" does not have to re-answer the question
 * they already answered by clicking. Validated against the catalog — an unknown
 * value is ignored rather than trusted.
 */
export default async function NewBookPage({
  searchParams,
}: {
  searchParams: Promise<{
    genre?: string;
    from?: string;
    resume?: string;
    e2eStartMode?: string;
  }>;
}) {
  const { genre, from, resume, e2eStartMode: requestedE2EStartMode } = await searchParams;
  const initialGenre = (GENRE_IDS as readonly string[]).includes(genre ?? "")
    ? (genre as GenreId)
    : undefined;
  // This marker changes only the client restore position. The draft itself is
  // still loaded from the authenticated account's scoped key and revalidated
  // before the wizard may move past Step 1.
  const resumeAfterCheckout = z.literal("checkout").safeParse(resume).success;
  // This query parameter is not a product feature. It is passed to the client
  // only inside a local, isolated, explicitly stubbed browser-test process;
  // production cannot enable the gate even if both E2E variables are present.
  const e2eStartMode =
    requestedE2EStartMode === "fail_before_work" && isE2EWorkflowStubEnabled()
      ? requestedE2EStartMode
      : undefined;
  const { userId } = await requireUser();
  const access = await getStudioAccess(userId);
  const sourceProjectId = z.uuid().safeParse(from).success ? from : undefined;
  // Any book the author owns can seed the next one — the included story was
  // only ever the first case of that. Ownership is matched in the query rather
  // than checked afterwards, so guessing an id reads nothing at all, and the
  // full-book entitlement still decides whether a second book may be started.
  const [sourceProject] =
    access.fullBookUnlocked && sourceProjectId
      ? await getDb()
          .select({
            title: schema.projects.title,
            brief: schema.projects.brief,
            genre: schema.projects.genre,
            subgenre: schema.projects.subgenre,
            protagonist: schema.projects.protagonist,
            setting: schema.projects.setting,
            experience: schema.projects.experience,
            targetChapters: schema.projects.targetChapters,
            targetWordsPerChapter: schema.projects.targetWordsPerChapter,
            settings: schema.projects.settings,
          })
          .from(schema.projects)
          .where(and(eq(schema.projects.id, sourceProjectId), eq(schema.projects.userId, userId)))
          .limit(1)
      : [];
  const initialSetup: Partial<WizardState> | undefined = sourceProject
    ? projectCarryForwardSetup(sourceProject)
    : undefined;
  const carriedFromIncludedStory = sourceProject?.experience === "trial_short_story";
  const carriedTitle = carriedFromIncludedStory
    ? "Take your story to full length"
    : "Start another book from this one";
  const carriedDescription = carriedFromIncludedStory
    ? "Your title, genre, and brief are carried forward. Confirm the genre on Step 1, review the title and brief on Step 2, then choose the full-length shape and quality."
    : "Its title, genre, brief, and writing settings are carried forward. The book you started from is untouched — its chapters and history stay exactly where they are.";
  const includedStory = access.creationExperience === "trial_short_story";
  const existingIncludedStory = access.reason === "trial_exists";
  const verificationRequired = access.reason === "verify_email";
  const pageTitle = includedStory
    ? "Your included short story"
    : initialSetup
      ? carriedTitle
      : existingIncludedStory
        ? "Your next story"
        : verificationRequired
          ? "Your included short story"
          : "A new book";
  const pageDescription = includedStory
    ? "Four short steps from an idea to a complete story. Nothing runs until you review the production plan."
    : initialSetup
      ? carriedDescription
      : existingIncludedStory
        ? access.trialProjectCompleted
          ? "Your included story is complete. Keep reading or editing it, or carry it into a full-length production."
          : "Continue your included story with every Studio tool. Full-length continuation becomes available after it is complete."
        : verificationRequired
          ? "Verify your account to begin the complete included story—no purchase required."
          : "Four short steps from idea to estimate. Nothing runs until you approve the cost.";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="max-w-3xl border-b border-border pb-7">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{pageTitle}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
          {pageDescription}
        </p>
        {/* An author who already has a draft should not have to describe it to
            us in a brief. Offered here rather than buried, because the wizard
            below assumes a book that does not exist yet. */}
        {access.fullBookUnlocked ? (
          <div className="mt-5">
            <ImportDialog />
          </div>
        ) : null}
      </header>

      <NewBookWizard
        initialGenre={initialGenre}
        initialSetup={initialSetup}
        userId={userId}
        access={access}
        accountManagementEnabled={clerkEnabled}
        resumeAfterCheckout={resumeAfterCheckout}
        carriedFromIncludedStory={carriedFromIncludedStory}
        e2eStartMode={e2eStartMode}
      />
    </div>
  );
}
