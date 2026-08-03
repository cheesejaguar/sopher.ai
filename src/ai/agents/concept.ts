import { generateText, isStepCount, Output } from "ai";
import { eq } from "drizzle-orm";
import { schema, withDbTransaction, type DbTransaction } from "@/db";
import { seedEntities } from "@/db/queries/entities";
import { MODERATION_PROMPT, recordModerationFlag } from "@/lib/moderation";
import { MODELS, type QualityTier } from "@/ai/models";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import {
  assertMeteredInputWithinBudget,
  meteredInputGuard,
  meteredMaxOutputTokens,
} from "@/ai/metering-limits";
import { buildToolset, type ToolCtx } from "@/ai/tools";
import {
  buildConceptUserPrompt,
  conceptGenreFraming,
  CONCEPT_SYSTEM_PROMPT,
} from "@/ai/prompts/concept";
import { conceptSchema, type BookConcept } from "@/ai/schemas";
import { anthropicCachedSystem } from "@/ai/cache";

export type ConceptCtx = {
  meter: MeterCtx;
  tools: ToolCtx;
  tier: QualityTier;
  brief: string;
  workingTitle?: string;
  genre?: string;
  targetAudience?: string;
  contentGuidelines?: string;
};

export type ConceptCheckpointOptions = {
  expanded?: BookConcept;
  onExpanded?: (concept: BookConcept) => void | Promise<void>;
  onRefined?: (concept: BookConcept) => void | Promise<void>;
};

function refinePrompt(ctx: ConceptCtx, draft: BookConcept): string {
  return [
    `You previously expanded an author brief into the draft book concept below. Now critique and refine it in one pass.`,
    `## Draft concept\n${JSON.stringify(draft, null, 2)}`,
    `## Original author brief\n${ctx.brief}`,
    ctx.workingTitle
      ? `## Author-owned working title\n${ctx.workingTitle}\nPreserve this title exactly.`
      : "",
    ctx.genre ? `## Genre\n${ctx.genre}` : "",
    ctx.targetAudience ? `## Target audience\n${ctx.targetAudience}` : "",
    ctx.contentGuidelines ? `## Authoring constraints\n${ctx.contentGuidelines}` : "",
    // Refine runs after expand and rewrites elements wholesale. Without the same
    // non-fiction/audience framing the expand pass got, it happily re-invents a
    // memoir's real cast to make the concept "stronger".
    ...conceptGenreFraming(ctx.genre),
    `Identify the 2-3 weakest elements of this concept judged against what ${
      ctx.genre ? `${ctx.genre} readers` : "readers of this genre"
    } expect — a generic logline, a low-stakes central conflict, interchangeable characters, themes that don't connect to the plot, or "unique" elements that are actually common tropes.`,
    `Then return the REFINED concept: rewrite the weak elements to fix them, keep everything that already works, and preserve the same structure. Return the complete refined concept, not a critique.`,
    MODERATION_PROMPT,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Expands an author brief into a full book concept, then critiques and refines
 * it in a second pass. The expand step may consult genre conventions via tools.
 */
export async function generateConcept(
  input: ConceptCtx,
  checkpoint: ConceptCheckpointOptions = {},
): Promise<BookConcept> {
  const model = MODELS[input.tier].concept;

  const preserveTitle = (concept: BookConcept): BookConcept =>
    input.workingTitle ? { ...concept, title: input.workingTitle } : concept;
  let expanded = checkpoint.expanded ? preserveTitle(checkpoint.expanded) : undefined;
  if (!expanded) {
    const result = await metered(
      input.meter,
      { role: "concept", operation: "concept.expand", model },
      () =>
        generateText({
          model,
          instructions: anthropicCachedSystem(CONCEPT_SYSTEM_PROMPT),
          prompt: buildConceptUserPrompt({
            brief: input.brief,
            workingTitle: input.workingTitle,
            genre: input.genre,
            targetAudience: input.targetAudience,
            contentGuidelines: input.contentGuidelines,
          }),
          tools: buildToolset("concept", input.tools),
          stopWhen: isStepCount(3),
          prepareStep: (options) => {
            assertMeteredInputWithinBudget(
              "concept.expand",
              {
                instructions: options.instructions,
                messages: options.messages,
              },
              options.stepNumber,
            );
            return options.stepNumber >= 2 ? { activeTools: [] } : {};
          },
          maxOutputTokens: meteredMaxOutputTokens("concept.expand"),
          output: Output.object({ schema: conceptSchema }),
          providerOptions: gatewayOptions(input.meter, "concept"),
        }),
    );
    expanded = preserveTitle(result.output);
    await checkpoint.onExpanded?.(expanded);
  }

  const refined = await metered(
    input.meter,
    { role: "concept", operation: "concept.refine", model },
    () =>
      generateText({
        model,
        instructions: anthropicCachedSystem(CONCEPT_SYSTEM_PROMPT),
        prompt: refinePrompt(input, expanded),
        maxOutputTokens: meteredMaxOutputTokens("concept.refine"),
        prepareStep: meteredInputGuard("concept.refine"),
        output: Output.object({ schema: conceptSchema }),
        providerOptions: gatewayOptions(input.meter, "concept"),
      }),
  );

  const final = preserveTitle(refined.output);
  await checkpoint.onRefined?.(final);
  return final;
}

/**
 * Persists the concept onto the book row and seeds the story bible from the
 * concept's cast. Existing entities win (onConflictDoNothing on
 * uq_entity_name) so re-running never clobbers canon later chapters added.
 */
export async function persistConcept(
  bookId: string,
  concept: BookConcept,
  transaction?: DbTransaction,
): Promise<void> {
  const persist = async (db: DbTransaction) => {
    const [book] = await db
      .select({ projectId: schema.books.projectId, title: schema.books.title })
      .from(schema.books)
      .where(eq(schema.books.id, bookId))
      .limit(1);

    // Quiet brief-level moderation: the verdict rode the concept call itself.
    if (concept.moderation?.flagged) {
      if (book) {
        await recordModerationFlag(
          {
            projectId: book.projectId,
            source: "brief",
            verdict: concept.moderation,
          },
          db,
        );
      }
    }

    // The verdict is admin-only bookkeeping; the author-owned concept jsonb
    // (loaded by getProjectWithBook) must never carry it.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring strips the field
    const { moderation, ...persistableConcept } = concept;
    const authorTitle = book?.title ?? concept.title;
    await db
      .update(schema.books)
      .set({
        title: authorTitle,
        synopsis: concept.synopsis,
        concept: { ...persistableConcept, title: authorTitle },
        updatedAt: new Date(),
      })
      .where(eq(schema.books.id, bookId));

    await seedEntities(
      bookId,
      concept.characters.map((c) => ({
        kind: "character" as const,
        name: c.name,
        attrs: {
          role: c.role,
          background: c.description,
          arc: c.arc,
          facts: [c.description, `Arc: ${c.arc}`],
        },
      })),
      db,
    );
  };

  if (transaction) return persist(transaction);
  await withDbTransaction(persist);
}
