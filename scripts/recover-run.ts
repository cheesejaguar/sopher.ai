/**
 * Completes a run whose manuscript is finished but whose continuity review
 * failed, replacing scripts/complete-run.ts.
 *
 * The 2026-08-04 incident is now prevented at the source (permissive wire
 * schemas plus normalizers) and survivable in the workflow (a failed quality
 * pass degrades instead of discarding the book). Neither helps a run that
 * already failed under the old code: those rows are terminal, and terminal is
 * deliberately sticky, so `transitionAuthoringRunState` will not move them.
 *
 * `finalizeStep` cannot be borrowed either — it is a `"use step"` function and
 * calls `getStepMetadata()`/`getWritable()`, which only exist inside a running
 * workflow. So this reproduces exactly what finalizeStep persists, including
 * the two things scripts/complete-run.ts left out and that nothing else writes:
 * `completion.finalized` and `projects.completedAt`. Without them the book is
 * not a completed full book anywhere in the product, and every export is
 * stamped "an incomplete production snapshot".
 *
 * Preconditions are checked and refused loudly rather than repaired: this
 * finalizes a manuscript that is already whole, and nothing else.
 *
 *   pnpm exec dotenv -e .env.local -- pnpm exec tsx scripts/recover-run.ts <runId> [--apply]
 *
 * Without --apply it reports what it would do and writes nothing.
 */
import { eq, sql } from "drizzle-orm";

import { DEGRADATION_CODES, degradationNotice } from "../src/lib/authoring-degradation";
import { getDb, schema, withDbTransaction, type Db, type DbTransaction } from "../src/db";
import { manuscriptDigest, type ManuscriptStateRow } from "../src/lib/manuscript-state";
import type { GenerationConfig } from "../src/lib/run-events";

const DONE_DETAIL = "Your manuscript is finished. The consistency review did not complete.";

async function main() {
  const runId = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!runId) throw new Error("Usage: recover-run.ts <generation_runs.id> [--apply]");
  const db = getDb();

  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Run not found");
  if (run.status !== "failed") {
    throw new Error(`Refusing to recover a run in status "${run.status}"; expected "failed".`);
  }

  const [book] = await db
    .select()
    .from(schema.books)
    .where(eq(schema.books.projectId, run.projectId))
    .limit(1);
  if (!book) throw new Error("Book not found");

  const config = run.config as GenerationConfig;
  if (config.completion?.finalized)
    throw new Error("Run is already finalized; nothing to recover.");

  const expected = config.targetChapters;

  const readChapters = (executor: Db | DbTransaction) =>
    executor
      .select({
        id: schema.chapters.id,
        chapterNumber: schema.chapters.chapterNumber,
        title: schema.chapters.title,
        summary: schema.chapters.summary,
        content: schema.chapters.content,
        status: schema.chapters.status,
        wordCount: schema.chapters.wordCount,
      })
      .from(schema.chapters)
      .where(eq(schema.chapters.bookId, book.id));

  /** The completeness rule finalizeStep enforces, applied to one read. */
  const completeCount = (rows: { chapterNumber: number; content: string; wordCount: number }[]) =>
    rows.filter(
      (chapter) =>
        chapter.chapterNumber >= 1 &&
        chapter.chapterNumber <= expected &&
        chapter.wordCount > 0 &&
        chapter.content.trim().length > 0,
    ).length;

  // Advisory only: a failed run is not active authoring, so the author may be
  // editing this manuscript right now. This read is for the operator's report
  // and for refusing obviously hopeless cases early — the authoritative check
  // happens under the lock below.
  const preview = completeCount(await readChapters(db));
  console.log(`"${book.title}" — ${preview}/${expected} chapters complete`);
  if (preview < expected) {
    throw new Error(
      `Refusing to finalize: ${preview} of ${expected} chapters have prose. This run needs regeneration, not recovery.`,
    );
  }

  if (!apply) {
    console.log("\nDRY RUN — nothing written. Would:");
    console.log(`  flip ${preview} chapters to final, write completion.finalized,`);
    console.log("  record the skipped consistency review, mark the run completed,");
    console.log("  and set projects.completedAt. No model calls, no charge.");
    console.log("\nRe-run with --apply to perform it.");
    return;
  }

  // No continuity review is run here, deliberately. The fixed pipeline now
  // finishes a book whose review could not complete and records the skipped
  // pass; recovery should land in exactly that state rather than invent a
  // different one. It also means recovery costs the author nothing and needs
  // no credit authorization — a metered call would be refused on a terminal
  // run anyway, correctly. The review can be re-run later from the editor.
  try {
    await withDbTransaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:project-authoring:' || ${run.projectId}, 0)
      )`,
      );

      // Everything the write depends on is read again HERE, under the lock,
      // exactly as finalizeStep does. A failed run is not active authoring, so
      // nothing stopped the author from editing between the preview above and
      // this transaction.
      //
      // The run row first: another operator or a retry could have finalized or
      // restarted it since the read at the top, and its config is the base for
      // the write below, so a stale copy would silently discard their work.
      const [live] = await tx
        .select({ status: schema.generationRuns.status, config: schema.generationRuns.config })
        .from(schema.generationRuns)
        .where(eq(schema.generationRuns.id, run.id))
        .limit(1);
      if (!live) throw new Error("Run disappeared while recovering. Nothing was written.");
      const liveConfig = live.config as GenerationConfig;
      if (live.status !== "failed" || liveConfig.completion?.finalized) {
        throw new Error(
          `Run changed while recovering: status is now "${live.status}"${
            liveConfig.completion?.finalized ? " and it is already finalized" : ""
          }. Nothing was written.`,
        );
      }

      // Then the chapters. Finalizing on the earlier read could mark a run
      // completed against prose that has since been emptied, and would stamp
      // completion.finalized with a digest that no longer matches the stored
      // manuscript — the one value the rest of the product trusts to prove
      // this book is finished.
      const current = await readChapters(tx);
      const confirmed = completeCount(current);
      if (confirmed < expected) {
        throw new Error(
          `Manuscript changed while recovering: ${confirmed} of ${expected} chapters now have prose. Nothing was written.`,
        );
      }
      const finalizedRows = current.map((chapter) =>
        chapter.status === "drafted" || chapter.status === "edited"
          ? { ...chapter, status: "final" }
          : chapter,
      ) as ManuscriptStateRow[];
      const digest = manuscriptDigest(finalizedRows);

      await tx
        .update(schema.chapters)
        .set({ status: "final" })
        .where(
          sql`${schema.chapters.bookId} = ${book.id} and ${schema.chapters.status} in ('drafted', 'edited')`,
        );
      const nextConfig: GenerationConfig = {
        ...liveConfig,
        completion: {
          ...liveConfig.completion,
          finalized: { sourceRunId: run.id, manuscriptDigest: digest },
          degraded: [
            {
              stage: "continuity" as const,
              code: DEGRADATION_CODES.continuity_review_unavailable,
              reason: run.error ?? "The consistency review did not complete.",
              at: new Date().toISOString(),
            },
          ],
        },
      };
      for (const event of [
        {
          type: "notice",
          code: DEGRADATION_CODES.continuity_review_unavailable,
          message: degradationNotice(DEGRADATION_CODES.continuity_review_unavailable),
          stage: "continuity",
        },
        { type: "stage", stage: "done", pct: 100, detail: DONE_DETAIL },
      ]) {
        await tx.insert(schema.generationEvents).values({
          runId: run.id,
          seq: sql`coalesce((select max(seq) from ${schema.generationEvents} where ${schema.generationEvents.runId} = ${run.id}), 0) + 1` as unknown as number,
          type: event.type,
          payload: event,
        });
      }
      await tx
        .update(schema.generationRuns)
        .set({
          status: "completed",
          error: null,
          rootErrorCode: null,
          rootErrorStage: null,
          currentStage: "done",
          progressPct: 100,
          stageDescription: DONE_DETAIL,
          completedAt: new Date(),
          config: nextConfig,
        })
        .where(eq(schema.generationRuns.id, run.id));
      await tx
        .update(schema.projects)
        .set({ status: "editing", completedAt: new Date(), updatedAt: new Date() })
        .where(eq(schema.projects.id, run.projectId));
    });
  } catch (error) {
    console.error("Finalization failed; the run was left in its original failed record.");
    throw error;
  }

  console.log(
    "Recovered. The book is a completed full book and exports will not be stamped draft.",
  );
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
