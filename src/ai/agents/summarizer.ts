import { generateText, Output } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { MODELS, type QualityTier } from "@/ai/models";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { chapterSummarySchema, type ChapterSummary } from "@/ai/schemas";

/**
 * Writes the rolling ~250-token summary + character-bible facts delta after a
 * chapter is drafted. This is what makes later chapters cheap: successors read
 * summaries and query the bible instead of ingesting full prior chapters.
 */
export async function summarizeChapter(input: {
  meter: MeterCtx;
  bookId: string;
  chapterNumber: number;
  chapterTitle: string | null;
  content: string;
  tier: QualityTier;
}): Promise<ChapterSummary> {
  const model = MODELS[input.tier].summarizer;
  const result = await metered(
    input.meter,
    { role: "summarizer", operation: "summarizer.chapter", model },
    () =>
      generateText({
        model,
        instructions:
          "You maintain a book's story memory. Summarize tightly and extract only facts future chapters must honor.",
        prompt: [
          `Summarize chapter ${input.chapterNumber} ("${input.chapterTitle ?? "untitled"}") in at most 200 words, covering plot events, character developments, and any objects/promises/injuries that matter later.`,
          `Then list new canonical facts per character introduced in this chapter (only durable facts — appearance, relationships, possessions, wounds, secrets, commitments).`,
          `## Chapter text\n${input.content}`,
        ].join("\n\n"),
        output: Output.object({ schema: chapterSummarySchema }),
        providerOptions: gatewayOptions(input.meter, "summarizer"),
      }),
  );

  const summary = result.output;
  const db = getDb();
  await db
    .update(schema.chapters)
    .set({ summary: summary.summary, updatedAt: new Date() })
    .where(
      and(
        eq(schema.chapters.bookId, input.bookId),
        eq(schema.chapters.chapterNumber, input.chapterNumber),
      ),
    );

  // Atomic upsert: concurrent chapter steps in a wave append facts without
  // lost updates or racing the uq_character_name unique index.
  for (const entry of summary.newFacts) {
    await db
      .insert(schema.characterBible)
      .values({
        bookId: input.bookId,
        name: entry.character,
        facts: { facts: entry.facts, firstAppearance: input.chapterNumber },
        updatedByChapter: input.chapterNumber,
      })
      .onConflictDoUpdate({
        target: [schema.characterBible.bookId, schema.characterBible.name],
        set: {
          facts: sql`jsonb_set(${schema.characterBible.facts}, '{facts}', coalesce(${schema.characterBible.facts}->'facts', '[]'::jsonb) || (excluded.facts->'facts'))`,
          updatedByChapter: input.chapterNumber,
          updatedAt: new Date(),
        },
      });
  }

  return summary;
}
