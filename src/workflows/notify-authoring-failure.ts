import { and, eq, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { netRunCreditsUsedSql } from "@/lib/billing/run-spend";
import { resolveAuthoringEmailAction } from "@/lib/authoring-email-action";
import { sendAuthoringNeedsAttentionEmail } from "@/lib/email/send";

/**
 * Sends the idempotent action-required notice only after the workflow has
 * durably stored a terminal failure. Cancellation deliberately does not call
 * this step.
 */
export async function notifyAuthoringFailureStep(ref: {
  dbRunId: string;
  projectId: string;
  userId: string;
}): Promise<void> {
  "use step";
  try {
    const db = getDb();
    const [[facts], [spend]] = await Promise.all([
      db
        .select({
          email: schema.users.email,
          title: schema.projects.title,
          supportReference: schema.generationRuns.supportReference,
          status: schema.generationRuns.status,
          savedChapterCount: sql<number>`(
            select count(*)::int
            from ${schema.chapters}
            inner join ${schema.books}
              on ${schema.books.id} = ${schema.chapters.bookId}
            where ${schema.books.projectId} = ${ref.projectId}
              and ${schema.chapters.wordCount} > 0
              and length(btrim(${schema.chapters.content})) > 0
          )`,
        })
        .from(schema.generationRuns)
        .innerJoin(schema.projects, eq(schema.projects.id, schema.generationRuns.projectId))
        .innerJoin(schema.users, eq(schema.users.id, schema.generationRuns.userId))
        .where(
          and(
            eq(schema.generationRuns.id, ref.dbRunId),
            eq(schema.generationRuns.projectId, ref.projectId),
            eq(schema.generationRuns.userId, ref.userId),
          ),
        )
        .limit(1),
      db
        .select({ creditsUsed: netRunCreditsUsedSql() })
        .from(schema.creditLedger)
        .where(eq(schema.creditLedger.runId, ref.dbRunId)),
    ]);
    if (!facts?.email || facts.status !== "failed") return;
    const creditsUsed = Number(spend?.creditsUsed ?? 0);
    const nextAction = await resolveAuthoringEmailAction({
      userId: ref.userId,
      projectId: ref.projectId,
      supportReference: facts.supportReference,
    });
    await sendAuthoringNeedsAttentionEmail({
      userId: ref.userId,
      to: facts.email,
      bookTitle: facts.title,
      runId: ref.dbRunId,
      savedChapterCount: facts.savedChapterCount,
      creditsUsed,
      noWorkStarted: facts.savedChapterCount === 0 && creditsUsed <= 0,
      supportReference: facts.supportReference,
      nextActionHref: nextAction.href,
      nextActionLabel: nextAction.label,
    });
  } catch (error) {
    // Notification is action guidance, not part of the authoring transaction.
    console.warn("[email] direct authoring failure notification failed:", error);
  }
}
