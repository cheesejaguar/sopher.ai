import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const maxDuration = 30;

/**
 * Convergence check for a prose stream that ended cleanly. Workflow streams
 * are transport, while the chapter row is the durable manuscript.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ runId: string; chapterNumber: string }> },
) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }
  const { runId, chapterNumber: rawChapterNumber } = await ctx.params;
  const chapterNumber = Number(rawChapterNumber);
  if (
    !z.uuid().safeParse(runId).success ||
    !Number.isInteger(chapterNumber) ||
    chapterNumber < 1 ||
    chapterNumber > 1_000
  ) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();
  const [run] = await db
    .select({
      projectId: schema.generationRuns.projectId,
      status: schema.generationRuns.status,
    })
    .from(schema.generationRuns)
    .where(and(eq(schema.generationRuns.id, runId), eq(schema.generationRuns.userId, userId)))
    .limit(1);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });

  const [chapter] = await db
    .select({
      content: schema.chapters.content,
      status: schema.chapters.status,
      wordCount: schema.chapters.wordCount,
    })
    .from(schema.chapters)
    .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
    .where(
      and(
        eq(schema.books.projectId, run.projectId),
        eq(schema.chapters.chapterNumber, chapterNumber),
      ),
    )
    .limit(1);
  const saved = Boolean(
    chapter &&
    chapter.wordCount > 0 &&
    chapter.content.trim().length > 0 &&
    chapter.status !== "planned" &&
    chapter.status !== "drafting",
  );
  return Response.json(
    {
      saved,
      content: saved ? chapter!.content : null,
      chapterStatus: chapter?.status ?? null,
      runStatus: run.status,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
