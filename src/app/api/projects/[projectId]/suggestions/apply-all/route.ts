import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { schema, withDbTransaction } from "@/db";
import { requireUser } from "@/lib/auth";
import { applyRanges, BOOK_REPLACE_REVISION_SOURCE } from "@/lib/editor/replace-plan";
import { countWords } from "@/lib/editor/anchors";

const bodySchema = z.object({
  runId: z.uuid().optional(),
});

/**
 * Apply every pending suggestion for a manuscript in one author-approved
 * transaction. This is deliberately separate from the chapter action: a
 * manuscript-wide review must either apply everywhere it still matches or
 * apply nowhere.
 */
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { userId } = await requireUser();
  const { projectId } = await context.params;
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const result = await withDbTransaction(async (tx) => {
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
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .where(
        and(
          eq(schema.projects.id, projectId),
          eq(schema.projects.userId, userId),
          eq(schema.suggestions.status, "pending"),
          parsed.data.runId ? eq(schema.suggestions.runId, parsed.data.runId) : undefined,
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
    const byId = new Map(chapters.map((chapter) => [chapter.id, chapter]));
    const nextByChapter = new Map<string, { content: string; version: number; ids: string[] }>();
    for (const chapter of chapters) {
      const chapterSuggestions = pending
        .filter((suggestion) => suggestion.chapterId === chapter.id)
        .sort((a, b) => b.anchor.start - a.anchor.start);
      if (chapterSuggestions.length === 0) continue;
      if (chapterSuggestions.some((suggestion) => suggestion.chapterVersion !== chapter.version)) {
        return { conflict: true as const };
      }
      let previousStart = Number.POSITIVE_INFINITY;
      const ranges = chapterSuggestions.map((suggestion) => {
        const { start, end, originalText } = suggestion.anchor;
        if (
          start < 0 ||
          end < start ||
          start >= previousStart ||
          chapter.content.slice(start, end) !== originalText
        ) {
          return null;
        }
        previousStart = start;
        return { start, end, replacement: suggestion.suggestedText };
      });
      if (ranges.some((range) => range === null)) return { conflict: true as const };
      nextByChapter.set(chapter.id, {
        content: chapter.content,
        version: chapter.version,
        ids: chapterSuggestions.map((suggestion) => suggestion.id),
      });
      // Ranges are descending, so replacing one never shifts a later range.
      let content = chapter.content;
      for (const range of ranges) {
        const match = range!;
        content = applyRanges(content, [{ start: match.start, end: match.end }], match.replacement);
      }
      nextByChapter.get(chapter.id)!.content = content;
    }

    for (const [chapterId, next] of nextByChapter) {
      await tx.insert(schema.chapterRevisions).values({
        chapterId,
        content: byId.get(chapterId)!.content,
        source: BOOK_REPLACE_REVISION_SOURCE,
      });
      const [updated] = await tx
        .update(schema.chapters)
        .set({
          content: next.content,
          wordCount: countWords(next.content),
          version: next.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.chapters.id, chapterId), eq(schema.chapters.version, next.version)))
        .returning({ id: schema.chapters.id });
      if (!updated) return { conflict: true as const };
      await tx
        .update(schema.suggestions)
        .set({ status: "applied" })
        .where(inArray(schema.suggestions.id, next.ids));
    }
    return { applied: pending.length, chaptersChanged: nextByChapter.size };
  });

  if ("conflict" in result && result.conflict) {
    return Response.json(
      { error: "The manuscript changed while you were reviewing it. Nothing was applied." },
      { status: 409 },
    );
  }
  return Response.json(result);
}
