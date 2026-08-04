import { generateText, Output } from "ai";
import { and, eq } from "drizzle-orm";
import { schema, withDbTransaction, type DbTransaction } from "@/db";
import { MODELS, type QualityTier } from "@/ai/models";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import {
  chapterSummaryWireSchema,
  normalizeChapterSummary,
  type ChapterSummary,
} from "@/ai/schemas";
import { applyEntityDeltas } from "@/db/queries/entities";
import { MODERATION_PROMPT, recordModerationFlag } from "@/lib/moderation";

/**
 * Writes the rolling ~250-token summary + the story-bible delta after a chapter
 * is drafted. This is what makes later chapters cheap: successors read summaries
 * and query the bible instead of ingesting full prior chapters.
 *
 * Entity upkeep deliberately rides on this existing call rather than adding a
 * per-chapter request of its own — the marginal cost is a few hundred output
 * tokens.
 */
export type ChapterSummaryInput = {
  meter: MeterCtx;
  bookId: string;
  chapterNumber: number;
  chapterTitle: string | null;
  content: string;
  tier: QualityTier;
};

/** The single metered extraction call, separated from its idempotent DB tail. */
export async function generateChapterSummary(input: ChapterSummaryInput): Promise<ChapterSummary> {
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
          `Also list any relationships the chapter established between named entities (family ties especially — they govern surnames), with a brief description of what each relationship means in the story.`,
          MODERATION_PROMPT,
          `## Chapter text\n${input.content}`,
        ].join("\n\n"),
        maxOutputTokens: meteredMaxOutputTokens("summarizer.chapter"),
        prepareStep: meteredInputGuard("summarizer.chapter"),
        // Permissive wire schema plus normalizeChapterSummary, because the
        // caps below (200-word summary, 16 entities, 8 facts each, the entity
        // kind enum) are stripped from the schema the model is shown. This
        // call runs after every chapter, so a rejection here strands a chapter
        // that is already written — and takes the story bible with it.
        output: Output.object({ schema: chapterSummaryWireSchema }),
        providerOptions: gatewayOptions(input.meter, "summarizer"),
      }),
  );

  return normalizeChapterSummary(result.output);
}

/**
 * Applies a previously generated summary. Keeping this separate means a retry
 * after any DB-side tail failure reuses the paid structured result.
 */
export async function persistChapterSummary(
  input: ChapterSummaryInput,
  summary: ChapterSummary,
  transaction?: DbTransaction,
): Promise<void> {
  const persist = async (db: DbTransaction) => {
    // No summary in the answer means the model returned none, not that the
    // chapter has none: the outline already wrote one for every chapter, and
    // overwriting it with a blank would lose work this call never redid. The
    // entity deltas below still apply — they are a separate part of the answer.
    if (summary.summary !== null) {
      await db
        .update(schema.chapters)
        .set({ summary: summary.summary, updatedAt: new Date() })
        .where(
          and(
            eq(schema.chapters.bookId, input.bookId),
            eq(schema.chapters.chapterNumber, input.chapterNumber),
          ),
        );
    }

    await applyEntityDeltas(
      {
        bookId: input.bookId,
        chapterNumber: input.chapterNumber,
        newFacts: summary.newFacts,
        relationships: summary.relationships,
      },
      db,
    );

    if (summary.moderation?.flagged) {
      const [book] = await db
        .select({ projectId: schema.books.projectId })
        .from(schema.books)
        .where(eq(schema.books.id, input.bookId))
        .limit(1);
      if (book) {
        await recordModerationFlag(
          {
            projectId: book.projectId,
            source: "chapter",
            chapterNumber: input.chapterNumber,
            verdict: summary.moderation,
          },
          db,
        );
      }
    }
  };

  if (transaction) return persist(transaction);
  await withDbTransaction(persist);
}

export async function summarizeChapter(input: ChapterSummaryInput): Promise<ChapterSummary> {
  const summary = await generateChapterSummary(input);
  await persistChapterSummary(input, summary);
  return summary;
}
