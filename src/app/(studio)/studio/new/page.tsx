import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { NewBookWizard } from "@/components/wizard/new-book-wizard";
import type { WizardState } from "@/components/wizard/wizard-state";
import { GENRE_IDS, type GenreId } from "@/ai/knowledge/genres";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";
import { getStudioAccess } from "@/lib/studio-access";
import { clerkEnabled } from "@/lib/clerk";

export const metadata: Metadata = {
  title: "A new book",
};

function editableBrief(source: {
  brief: string | null;
  subgenre: string | null;
  protagonist: string | null;
  setting: string | null;
}): string {
  const brief = source.brief?.trim() ?? "";
  const extras: string[] = [];
  if (source.subgenre) extras.push(`Subgenre: ${source.subgenre}.`);
  if (source.protagonist?.trim()) extras.push(`Protagonist: ${source.protagonist.trim()}.`);
  if (source.setting?.trim()) extras.push(`Setting: ${source.setting.trim()}.`);
  if (extras.length === 0) return brief;
  const suffix = `\n\n${extras.join("\n")}`;
  return brief.endsWith(suffix) ? brief.slice(0, -suffix.length).trimEnd() : brief;
}

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
          })
          .from(schema.projects)
          .where(
            and(
              eq(schema.projects.id, sourceProjectId),
              eq(schema.projects.userId, userId),
              eq(schema.projects.experience, "trial_short_story"),
            ),
          )
          .limit(1)
      : [];
  const carriedGenre =
    sourceProject && (GENRE_IDS as readonly string[]).includes(sourceProject.genre ?? "")
      ? (sourceProject.genre as GenreId)
      : null;
  const initialSetup: Partial<WizardState> | undefined = sourceProject
    ? {
        title: sourceProject.title,
        brief: editableBrief(sourceProject),
        genre: carriedGenre,
        subgenre: sourceProject.subgenre,
        protagonist: sourceProject.protagonist ?? "",
        setting: sourceProject.setting ?? "",
      }
    : undefined;
  const includedStory = access.creationExperience === "trial_short_story";
  const existingIncludedStory = access.reason === "trial_exists";
  const verificationRequired = access.reason === "verify_email";
  const pageTitle = includedStory
    ? "Your included short story"
    : initialSetup
      ? "Take your story to full length"
      : existingIncludedStory
        ? "Your next story"
        : verificationRequired
          ? "Your included short story"
          : "A new book";
  const pageDescription = includedStory
    ? "Four short steps from an idea to a complete story. Nothing runs until you review the production plan."
    : initialSetup
      ? "Your title, genre, and brief are carried forward. Confirm the genre on Step 1, review the title and brief on Step 2, then choose the full-length shape and quality."
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
      </header>

      <NewBookWizard
        initialGenre={initialGenre}
        initialSetup={initialSetup}
        userId={userId}
        access={access}
        accountManagementEnabled={clerkEnabled}
        resumeAfterCheckout={resumeAfterCheckout}
        e2eStartMode={e2eStartMode}
      />
    </div>
  );
}
