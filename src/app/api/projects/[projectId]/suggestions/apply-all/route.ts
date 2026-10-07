import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb, schema, withDbTransaction } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { APPLY_ALL_REVISION_SOURCE, planApplyAll } from "@/lib/editor/apply-all-plan";
import { hasActiveAuthoringRun, noActiveAuthoringRunSql } from "@/lib/generation-runs";

export const maxDuration = 30;

const bodySchema = z.object({ runId: z.uuid() });

/** Thrown inside the transaction so a partial apply always rolls back. */
class ApplyAllConflict extends Error {
  constructor(readonly kind: "changed" | "active-run") {
    super(kind);
  }
}

const CHANGED_MESSAGE = "The manuscript changed while you were reviewing it. Nothing was applied.";
const ACTIVE_RUN_MESSAGE = "Finish or stop the current run before applying suggestions";

/**
 * Apply every pending suggestion from one manuscript review in a single
 * author-approved transaction: the review applies everywhere it still matches
 * or nowhere. Deliberately separate from the per-suggestion route, which
 * re-anchors moved quotes — a bulk apply must not guess.
 */
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  const { projectId } = await context.params;
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { runId } = parsed.data;

  // Ownership before any lock, so one author can never stall another's project.
  const [owned] = await getDb()
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!owned) return Response.json({ error: "Project not found" }, { status: 404 });

  if (await hasActiveAuthoringRun(projectId)) {
    return Response.json({ error: ACTIVE_RUN_MESSAGE }, { status: 409 });
  }

  let result: { applied: number; chaptersChanged: number };
  try {
    result = await withDbTransaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended('sopher:project-authoring:' || ${projectId}, 0))`,
      );
      const pending = await tx
        .select({
          id: schema.suggestions.id,
          chapterId: schema.suggestions.chapterId,
          chapterVersion: schema.suggestions.chapterVersion,
          anchor: schema.suggestions.anchor,
          suggestedText: schema.suggestions.suggestedText,
        })
        .from(schema.suggestions)
        .innerJoin(schema.chapters, eq(schema.chapters.id, schema.suggestions.chapterId))
        .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
        .where(
          and(
            eq(schema.books.projectId, projectId),
            eq(schema.suggestions.runId, runId),
            eq(schema.suggestions.status, "pending"),
          ),
        );
      if (pending.length === 0) return { applied: 0, chaptersChanged: 0 };

      const chapterIds = [...new Set(pending.map((item) => item.chapterId))];
      const chapters = await tx
        .select({
          id: schema.chapters.id,
          content: schema.chapters.content,
          version: schema.chapters.version,
        })
        .from(schema.chapters)
        .where(inArray(schema.chapters.id, chapterIds));

      const plan = planApplyAll(chapters, pending);
      if (plan.status === "conflict") throw new ApplyAllConflict("changed");

      if (plan.edits.length > 0) {
        await tx.insert(schema.chapterRevisions).values(
          plan.edits.map((edit) => ({
            chapterId: edit.chapterId,
            content: edit.previousContent,
            source: APPLY_ALL_REVISION_SOURCE,
          })),
        );
      }
      for (const edit of plan.edits) {
        const [updated] = await tx
          .update(schema.chapters)
          .set({
            content: edit.content,
            wordCount: edit.wordCount,
            version: edit.previousVersion + 1,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(schema.chapters.id, edit.chapterId),
              eq(schema.chapters.version, edit.previousVersion),
              noActiveAuthoringRunSql(projectId),
            ),
          )
          .returning({ id: schema.chapters.id });
        if (!updated) throw new ApplyAllConflict("changed");
      }

      const appliedIds = plan.edits.flatMap((edit) => edit.suggestionIds);
      if (appliedIds.length > 0) {
        await tx
          .update(schema.suggestions)
          .set({ status: "applied" })
          .where(inArray(schema.suggestions.id, appliedIds));
      }
      if (plan.retiredIds.length > 0) {
        await tx
          .update(schema.suggestions)
          .set({ status: "rejected" })
          .where(inArray(schema.suggestions.id, plan.retiredIds));
      }
      return { applied: appliedIds.length, chaptersChanged: plan.edits.length };
    });
  } catch (error) {
    if (error instanceof ApplyAllConflict) {
      // The guarded update can lose either race; report the one that happened.
      const activeRun = await hasActiveAuthoringRun(projectId);
      return Response.json(
        { error: activeRun ? ACTIVE_RUN_MESSAGE : CHANGED_MESSAGE },
        { status: 409 },
      );
    }
    throw error;
  }

  revalidatePath(`/projects/${projectId}`, "layout");
  return Response.json(result);
}
