import { generateText, Output } from "ai";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { MODELS, type QualityTier } from "@/ai/models";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { chapterSummarySchema, type ChapterSummary } from "@/ai/schemas";
import { applyEntityDeltas } from "@/db/queries/entities";

/**
 * Writes the rolling ~250-token summary + the story-bible delta after a chapter
 * is drafted. This is what makes later chapters cheap: successors read summaries
 * and query the bible instead of ingesting full prior chapters.
 *
 * Entity upkeep deliberately rides on this existing call rather than adding a
 * per-chapter request of its own — the marginal cost is a few hundred output
 * tokens.
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
          `Then list new canonical facts per entity this chapter established — not only characters but also locations (what a place contains), objects (who holds it, what it does), organizations and named events. Record only durable facts a later chapter must honor: appearance, heritage, possessions, wounds, secrets, commitments, contents, ownership.`,
          `Also list any relationships the chapter established between named entities (family ties especially — they govern surnames).`,
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

  await applyEntityDeltas({
    bookId: input.bookId,
    chapterNumber: input.chapterNumber,
    newFacts: summary.newFacts,
    relationships: summary.relationships,
  });

  return summary;
}
