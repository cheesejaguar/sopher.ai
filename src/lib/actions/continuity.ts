"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { continuityPhaseKeys } from "@/ai/prompts/review-rubric";
import { assertNotSuspended, requireUser, SuspendedError } from "@/lib/auth";
import { getAuthoringStartSafetyBlock } from "@/lib/authoring-start-safety";
import { buildBookGenerationConfig } from "@/lib/book-start";
import { getBalance } from "@/lib/billing/credits";
import { canonicalizeCreditRequirement, creditsForUsd } from "@/lib/billing/credits-shared";
import {
  insertQueuedAuthoringRun,
  linkAuthoringRunWorkflow,
  RunRequestKeyMismatchError,
  terminalizeAuthoringRun,
  TrialOptionalWorkInProgressError,
} from "@/lib/generation-runs";
import { assertProjectSpendAccess, ProjectSpendAccessError } from "@/lib/project-spend-access";
import { isActiveRunConflict } from "@/lib/run-conflict";
import type { GenerationConfig } from "@/lib/run-events";
import { isActionRateLimited, LIMITS } from "@/lib/security/rate-limit";
import { isChapterComplete } from "@/workflows/resume";
import { continuityPhaseRequiredUsd } from "@/workflows/opening-credit-plan";

/**
 * Resolve or dismiss a continuity issue. Resolution is a human judgement —
 * the agents only ever open issues; closing them belongs to the author.
 */
export async function setContinuityIssueStatus(
  issueId: string,
  status: "resolved" | "dismissed",
): Promise<void> {
  const { userId } = await requireUser();
  if (!z.uuid().safeParse(issueId).success) throw new Error("Issue not found");

  const db = getDb();
  // Ownership: issue -> book -> project -> user.
  const [issue] = await db
    .select({ id: schema.continuityIssues.id, projectId: schema.projects.id })
    .from(schema.continuityIssues)
    .innerJoin(schema.books, eq(schema.books.id, schema.continuityIssues.bookId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.continuityIssues.id, issueId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!issue) throw new Error("Issue not found");

  await db
    .update(schema.continuityIssues)
    .set({ status })
    .where(eq(schema.continuityIssues.id, issueId));
  revalidatePath(`/projects/${issue.projectId}/bible`);
}

const startConsistencyReviewSchema = z.object({
  projectId: z.uuid(),
  /** Client-minted idempotency key; one deliberate press of the button. */
  requestKey: z.uuid(),
});

export type StartConsistencyReviewResult =
  | { status: "started"; runId: string }
  | { status: "reattached"; runId: string }
  | { status: "refused"; message: string }
  | { status: "insufficient_credits"; message: string; balance: number; required: number };

function refused(message: string): StartConsistencyReviewResult {
  return { status: "refused", message };
}

/**
 * The book workflow may deliver a manuscript without its cross-chapter
 * consistency review (DEGRADATION_CODES.continuity_review_unavailable /
 * _partial). This is how the author asks for that review afterwards.
 *
 * It is a paid provider operation on a finished book, so it takes the same path
 * as every other one: identity, suspension, idempotent replay, ownership, rate
 * limit, the shared start-safety guard, spend authorization, then a queued run
 * and a durable Workflow. The review itself cannot run inline — see
 * `@/workflows/review-continuity` for why.
 *
 * The result is returned as data rather than thrown: server-action throw
 * messages are redacted in production, and every refusal below is something the
 * author needs to read.
 */
export async function startConsistencyReview(
  input: unknown,
): Promise<StartConsistencyReviewResult> {
  const { userId } = await requireUser();
  try {
    await assertNotSuspended(userId);
  } catch (error) {
    if (error instanceof SuspendedError) return refused(error.message);
    return refused("Your account access could not be confirmed. Please try again.");
  }

  const parsed = startConsistencyReviewSchema.safeParse(input);
  if (!parsed.success) return refused("That request was not understood. Please try again.");
  const { projectId, requestKey } = parsed.data;

  const db = getDb();
  const [project] = await db
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return refused("Project not found");

  // Replay before anything with a side effect: returning the run this key
  // already created cannot duplicate work, while a second insert can.
  const [replay] = await db
    .select({ id: schema.generationRuns.id, kind: schema.generationRuns.kind })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.requestKey, requestKey),
      ),
    )
    .limit(1);
  if (replay) {
    return replay.kind === "continuity"
      ? { status: "reattached", runId: replay.id }
      : refused("This request conflicts with a different production run.");
  }

  if (await isActionRateLimited(LIMITS.bookStart, userId)) {
    return refused("Too many runs started at once — give it a moment and try again.");
  }

  // Unresolved metering means a provider call was dispatched and never
  // reconciled. Nothing new may start against that project until support has
  // verified the outcome — the same bar a replacement book run has to clear.
  const safetyBlock = await getAuthoringStartSafetyBlock({ projectId, userId });
  if (safetyBlock) {
    return refused(
      `${safetyBlock.action.description} Support reference: ${safetyBlock.supportReference}.`,
    );
  }

  // Optional spend: this also refuses while any non-export run is active, which
  // is the "no active run for the project" precondition.
  try {
    await assertProjectSpendAccess({ userId, projectId, operationKind: "optional" });
  } catch (error) {
    if (error instanceof ProjectSpendAccessError) return refused(error.message);
    throw error;
  }

  const [sourceRun] = await db
    .select({ config: schema.generationRuns.config })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.projectId, projectId),
        eq(schema.generationRuns.userId, userId),
        eq(schema.generationRuns.kind, "full_book"),
        eq(schema.generationRuns.status, "completed"),
      ),
    )
    .orderBy(desc(schema.generationRuns.completedAt))
    .limit(1);
  if (!sourceRun) {
    return refused("There is no finished book to review yet.");
  }
  // The delivered book's own production shape, not today's project settings: an
  // author who edited the chapter count after delivery must not have their
  // finished manuscript judged incomplete.
  const sourceConfig = sourceRun.config as GenerationConfig;

  const [book] = await db
    .select({ id: schema.books.id })
    .from(schema.books)
    .where(eq(schema.books.projectId, projectId))
    .limit(1);
  if (!book) return refused("There is no finished book to review yet.");

  const chapters = await db
    .select({
      chapterNumber: schema.chapters.chapterNumber,
      status: schema.chapters.status,
      content: schema.chapters.content,
      wordCount: schema.chapters.wordCount,
      qualityScore: schema.chapters.qualityScore,
    })
    .from(schema.chapters)
    .where(eq(schema.chapters.bookId, book.id));
  const written = new Set(
    chapters.filter(isChapterComplete).map((chapter) => chapter.chapterNumber),
  );
  const missing = Array.from(
    { length: sourceConfig.targetChapters },
    (_, index) => index + 1,
  ).filter((chapterNumber) => !written.has(chapterNumber));
  if (missing.length > 0) {
    return refused(
      "The consistency review reads the whole book, so every chapter has to be written first.",
    );
  }

  const phases = continuityPhaseKeys(sourceConfig.tier);
  const required = canonicalizeCreditRequirement(
    creditsForUsd(continuityPhaseRequiredUsd(sourceConfig) * phases.length),
  );
  const balance = await getBalance(userId);
  if (balance < required) {
    return {
      status: "insufficient_credits",
      message: `${balance.toFixed(0)} credits available; ${required.toFixed(0)} needed for the consistency review.`,
      balance,
      required,
    };
  }

  // A fresh config, deliberately without the source run's `completion` block.
  // Inheriting paid work across runs has its own careful machinery in the book
  // workflow (staged-artifact matching, billing lineage); carrying a checkpoint
  // over by hand would let this run publish a score it never computed.
  const config: GenerationConfig = {
    ...buildBookGenerationConfig(project),
    tier: sourceConfig.tier,
    targetChapters: sourceConfig.targetChapters,
    targetWordsPerChapter: sourceConfig.targetWordsPerChapter,
  };

  let run: Awaited<ReturnType<typeof insertQueuedAuthoringRun>>;
  try {
    run = await insertQueuedAuthoringRun({
      projectId,
      userId,
      kind: "continuity",
      config,
      requestKey,
    });
  } catch (error) {
    if (error instanceof RunRequestKeyMismatchError) {
      return refused("This request conflicts with a different production run.");
    }
    if (error instanceof TrialOptionalWorkInProgressError) {
      return refused("Another AI tool is still finishing on this project. Try again shortly.");
    }
    // The partial unique index is the race-proof backstop behind the spend
    // check above.
    if (!isActiveRunConflict(error)) throw error;
    return refused("Another writing task is still running for this project.");
  }
  if (!run.inserted) return { status: "reattached", runId: run.id };

  const dispatched = await dispatchConsistencyReview({
    runId: run.id,
    projectId,
    userId,
    config,
  });
  if (!dispatched) {
    // No provider call can have happened: the Workflow self-links before its
    // first metered step, and a terminal run cannot be linked. Failing the run
    // here — rather than leaving it queued — is what keeps a lost dispatch from
    // blocking every other operation on the project.
    await terminalizeAuthoringRun({
      runId: run.id,
      projectId,
      userId,
      status: "failed",
      error: "Consistency review could not be handed off",
      releaseImmediately: true,
    });
    return refused("The review didn’t start. No credits were used — please try again.");
  }

  revalidatePath(`/projects/${projectId}/write`);
  revalidatePath(`/projects/${projectId}/manuscript`);
  return { status: "started", runId: run.id };
}

/**
 * Workflow acceptance for one queued continuity run. The entrypoint is imported
 * lazily so only the requests that dispatch it pay to load the workflow graph.
 */
async function dispatchConsistencyReview(input: {
  runId: string;
  projectId: string;
  userId: string;
  config: GenerationConfig;
}): Promise<boolean> {
  try {
    const [{ start }, { reviewManuscriptContinuity }] = await Promise.all([
      import("workflow/api"),
      import("@/workflows/review-continuity"),
    ]);
    const workflow = await start(reviewManuscriptContinuity, [
      input.runId,
      input.projectId,
      input.userId,
      input.config,
    ]);
    try {
      await linkAuthoringRunWorkflow({
        runId: input.runId,
        projectId: input.projectId,
        userId: input.userId,
        workflowRunId: workflow.runId,
      });
    } catch (error) {
      // reviewManuscriptContinuity self-links from getWorkflowMetadata() before
      // any paid work. An accepted Workflow must not be abandoned because this
      // redundant caller-side write lost its connection.
      console.error("Continuity review accepted before caller-side linkage persisted", {
        runId: input.runId,
        error,
      });
    }
    return true;
  } catch (error) {
    console.error("Continuity review Workflow was not accepted", {
      runId: input.runId,
      error,
    });
    return false;
  }
}
