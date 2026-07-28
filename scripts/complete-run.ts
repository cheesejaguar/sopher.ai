/**
 * Completes a generation run whose chapters finished but whose continuity
 * stage failed before the prepareStep fix: runs the patched continuity review,
 * persists the report event, finalizes chapter/run/project status.
 * Run: pnpm exec dotenv -e .env.local -- pnpm exec tsx scripts/complete-run.ts <runId>
 */
import { eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "../src/db";
import { runContinuityReview } from "../src/ai/agents/continuity";

async function main() {
  const runId = process.argv[2];
  if (!runId) throw new Error("Usage: complete-run.ts <generation_runs.id>");
  const db = getDb();

  const [run] = await db
    .select()
    .from(schema.generationRuns)
    .where(eq(schema.generationRuns.id, runId))
    .limit(1);
  if (!run) throw new Error("Run not found");

  const [book] = await db
    .select()
    .from(schema.books)
    .where(eq(schema.books.projectId, run.projectId))
    .limit(1);
  if (!book) throw new Error("Book not found");

  const config = run.config as { tier: "draft" | "standard" | "premium" };
  console.log(`Running continuity review for "${book.title}" (tier ${config.tier})...`);

  const report = await runContinuityReview({
    meter: { userId: run.userId, projectId: run.projectId, runId: run.id },
    tools: { userId: run.userId, projectId: run.projectId, bookId: book.id },
    tier: config.tier,
    runId: run.id,
  });
  console.log(
    `score=${report.score.toFixed(2)} issues=${report.issues.length} rec="${report.recommendation}"`,
  );

  await db.insert(schema.generationEvents).values({
    runId: run.id,
    seq: sql`coalesce((select max(seq) from ${schema.generationEvents} where ${schema.generationEvents.runId} = ${run.id}), 0) + 1` as unknown as number,
    type: "review",
    payload: {
      type: "review",
      score: report.score,
      recommendation: report.recommendation,
      issueCount: report.issues.length,
    },
  });

  await db
    .update(schema.chapters)
    .set({ status: "final" })
    .where(
      sql`${schema.chapters.bookId} = ${book.id} and ${schema.chapters.status} in ('drafted', 'edited')`,
    );
  await db
    .update(schema.generationRuns)
    .set({ status: "completed", error: null, completedAt: new Date() })
    .where(eq(schema.generationRuns.id, run.id));
  await db
    .update(schema.projects)
    .set({ status: "editing", updatedAt: new Date() })
    .where(eq(schema.projects.id, run.projectId));

  await db.insert(schema.generationEvents).values({
    runId: run.id,
    seq: sql`coalesce((select max(seq) from ${schema.generationEvents} where ${schema.generationEvents.runId} = ${run.id}), 0) + 1` as unknown as number,
    type: "stage",
    payload: { type: "stage", stage: "done", pct: 100, detail: report.recommendation },
  });
  console.log("Run finalized.");
  const rows = await db
    .select({ n: schema.chapters.chapterNumber, s: schema.chapters.status })
    .from(schema.chapters)
    .where(inArray(schema.chapters.status, ["final"]));
  console.log(`final chapters: ${rows.length}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
