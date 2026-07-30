import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { getChapterById, getChapterOwnership } from "@/db/queries/books";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { countWords, resolveAnchor } from "@/lib/editor/anchors";
import { toSuggestionDTO } from "@/lib/editor/types";
import { hasActiveAuthoringRun, noActiveAuthoringRunSql } from "@/lib/generation-runs";

export const maxDuration = 30;

const bodySchema = z.object({ action: z.enum(["accept", "reject"]) });

/**
 * Accept or reject a pending suggestion. Accept splices the suggested text
 * into the chapter (zero LLM calls): at the recorded offsets when the chapter
 * version still matches, otherwise re-anchored by an exact first-occurrence
 * search of the quoted original text — a 409 only happens when the quote no
 * longer appears in the chapter at all, or on a concurrent write.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ chapterId: string; suggestionId: string }> },
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

  const { chapterId, suggestionId } = await ctx.params;
  const uuid = z.uuid();
  if (!uuid.safeParse(chapterId).success || !uuid.safeParse(suggestionId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const db = getDb();
  const [suggestion] = await db
    .select()
    .from(schema.suggestions)
    .where(
      and(eq(schema.suggestions.id, suggestionId), eq(schema.suggestions.chapterId, chapterId)),
    )
    .limit(1);
  if (!suggestion) return Response.json({ error: "Not found" }, { status: 404 });
  if (suggestion.status !== "pending") {
    return Response.json({ error: `Suggestion already ${suggestion.status}` }, { status: 409 });
  }

  if (parsed.data.action === "reject") {
    const [updated] = await db
      .update(schema.suggestions)
      .set({ status: "rejected" })
      .where(and(eq(schema.suggestions.id, suggestionId), eq(schema.suggestions.status, "pending")))
      .returning();
    if (!updated) return Response.json({ error: "Suggestion already resolved" }, { status: 409 });
    return Response.json({ suggestion: toSuggestionDTO(updated) });
  }

  // Accept.
  if (await hasActiveAuthoringRun(ownership.projectId)) {
    return Response.json(
      { error: "Finish or stop the current run before applying suggestions" },
      { status: 409 },
    );
  }
  const chapter = await getChapterById(chapterId);
  if (!chapter) return Response.json({ error: "Not found" }, { status: 404 });

  const { anchor } = suggestion;
  let start: number;
  let end: number;
  if (chapter.content.slice(anchor.start, anchor.end) === anchor.originalText) {
    // The quoted passage still sits at its recorded offsets — use them even
    // when the version moved (typing elsewhere doesn't shift this passage).
    start = anchor.start;
    end = anchor.end;
  } else {
    // Re-anchor near the recorded position so duplicate passages resolve to
    // the intended occurrence, not the first.
    const found = resolveAnchor(chapter.content, anchor.originalText, anchor.start);
    if (!found) {
      // The quote is gone for good — retire the suggestion so it doesn't
      // reappear as pending on reload.
      await db
        .update(schema.suggestions)
        .set({ status: "rejected" })
        .where(
          and(eq(schema.suggestions.id, suggestionId), eq(schema.suggestions.status, "pending")),
        );
      return Response.json(
        {
          error: "The chapter has changed and this suggestion no longer matches",
          currentVersion: chapter.version,
        },
        { status: 409 },
      );
    }
    ({ start, end } = found);
  }

  const newContent =
    chapter.content.slice(0, start) + suggestion.suggestedText + chapter.content.slice(end);
  const newVersion = chapter.version + 1;
  const wordCount = countWords(newContent);

  // One atomic acceptance: lock the still-pending suggestion, apply the
  // guarded chapter CAS, archive the new version, and mark the suggestion
  // applied. A crash cannot leave applied prose behind a pending suggestion.
  const { rows: accepted } = await db.execute<{ version: number; suggestion_id: string }>(sql`
    with candidate as materialized (
      select ${schema.suggestions.id}
      from ${schema.suggestions}
      where ${schema.suggestions.id} = ${suggestionId}
        and ${schema.suggestions.chapterId} = ${chapterId}
        and ${schema.suggestions.status} = 'pending'
      for update
    ),
    updated_chapter as (
      update ${schema.chapters}
      set
        content = ${newContent},
        word_count = ${wordCount},
        version = ${newVersion},
        updated_at = ${new Date()}
      where ${schema.chapters.id} = ${chapterId}
        and ${schema.chapters.version} = ${chapter.version}
        and exists (select 1 from candidate)
        and ${noActiveAuthoringRunSql(ownership.projectId)}
      returning ${schema.chapters.version}
    ),
    revision as (
      insert into ${schema.chapterRevisions} (chapter_id, content, source)
      select ${chapterId}, ${newContent}, 'user'
      from updated_chapter
      returning ${schema.chapterRevisions.id}
    ),
    applied_suggestion as (
      update ${schema.suggestions}
      set status = 'applied'
      where ${schema.suggestions.id} in (select id from candidate)
        and exists (select 1 from updated_chapter)
      returning ${schema.suggestions.id}
    )
    select
      updated_chapter.version,
      applied_suggestion.id as suggestion_id
    from updated_chapter
    cross join revision
    cross join applied_suggestion
  `);
  if (!accepted[0]) {
    return Response.json(
      { error: "The chapter changed while applying — try again", currentVersion: newVersion },
      { status: 409 },
    );
  }

  const [applied] = await db
    .select()
    .from(schema.suggestions)
    .where(eq(schema.suggestions.id, accepted[0].suggestion_id))
    .limit(1);
  if (!applied) {
    return Response.json(
      { error: "Suggestion applied but could not be reloaded" },
      { status: 500 },
    );
  }

  const pending = await db
    .select()
    .from(schema.suggestions)
    .where(
      and(eq(schema.suggestions.chapterId, chapterId), eq(schema.suggestions.status, "pending")),
    )
    .orderBy(schema.suggestions.createdAt);

  return Response.json({
    suggestion: toSuggestionDTO(applied),
    chapter: { content: newContent, version: newVersion, wordCount },
    pending: pending.map(toSuggestionDTO),
  });
}
