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
import { conceptWireSchema, normalizeConcept, type BookConcept } from "@/ai/schemas";
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
 * A refined concept only replaces the expansion when it did not come back
 * thinner. The refine prompt asks for the complete concept, so an answer that
 * clears the viability floor but drops the cast is a partial answer rather
 * than an editorial choice — and taking it would throw away the story-bible
 * seed `persistConcept` builds from those names.
 */
function refineReplacesExpansion(
  refined: BookConcept | null,
  expanded: BookConcept,
): refined is BookConcept {
  if (!refined) return false;
  return refined.characters.length > 0 || expanded.characters.length === 0;
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
          // Permissive on the wire, strict in the app. Anthropic's
          // structured-output path strips `.max` from the schema it shows the
          // model, so a seventh theme or an eleventh character is an answer the
          // model had no way to know was over the cap — and re-validating it
          // here would throw away the whole brief expansion the author paid
          // for, deterministically, on every retry. normalizeConcept truncates
          // instead and lands back on BookConcept.
          output: Output.object({ schema: conceptWireSchema }),
          providerOptions: gatewayOptions(input.meter, "concept"),
        }),
    );
    const salvaged = normalizeConcept(result.output);
    // Nothing to fall back to on the first pass, and a concept with no logline
    // or synopsis cannot be outlined — better to fail the step than to hand
    // every later phase a blank brief. The message carries no provider text.
    if (!salvaged) throw new Error("Concept expansion returned no usable concept");
    expanded = preserveTitle(salvaged);
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
        // Same reasoning as the expand call above, and the stake is higher.
        // A rejection here no longer loses the expansion — `onExpanded` has
        // checkpointed it and the retry resumes from there — but it does buy
        // the same over-cap answer again, at the price of the whole pass.
        output: Output.object({ schema: conceptWireSchema }),
        providerOptions: gatewayOptions(input.meter, "concept"),
      }),
  );

  // A refine that answers half the concept must not replace the expansion the
  // author already paid for: the checkpointed expansion is a complete concept,
  // and re-asking would buy the same half-answer at full price.
  const salvaged = normalizeConcept(refined.output);
  const final = refineReplacesExpansion(salvaged, expanded) ? preserveTitle(salvaged) : expanded;
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
