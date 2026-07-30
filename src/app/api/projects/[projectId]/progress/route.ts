import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { getProjectProductionProgress } from "@/db/queries/project-progress";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { reconcileBeforeAuthoringRunConflict } from "@/lib/generation-runs";

export const maxDuration = 30;

/**
 * Small authenticated snapshot used by the persistent project lifecycle bar.
 * It intentionally returns no prose, event history, or run configuration.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  const { projectId } = await ctx.params;
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();
  const [project] = await db
    .select({
      targetChapters: schema.projects.targetChapters,
      bookId: schema.books.id,
    })
    .from(schema.projects)
    .leftJoin(schema.books, eq(schema.books.projectId, schema.projects.id))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  // The persistent lifecycle rail polls this endpoint every five seconds.
  // Reconcile the database with Workflow first so the rail does not remain
  // stuck on a remotely terminal run merely because its event stream stopped.
  await reconcileBeforeAuthoringRunConflict({ projectId, userId });

  const chapters = project.bookId
    ? await db
        .select({
          chapterNumber: schema.chapters.chapterNumber,
          status: schema.chapters.status,
        })
        .from(schema.chapters)
        .where(eq(schema.chapters.bookId, project.bookId))
    : [];
  const progress = await getProjectProductionProgress(projectId, chapters, project.targetChapters);

  return Response.json(
    { progress },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
