import { generateText, Output } from "ai";
import { z } from "zod";

import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { MODELS, type QualityTier } from "@/ai/models";
import { ENTITY_KINDS, RELATIONSHIP_TYPES } from "@/ai/schemas/entities";
import type { BookConcept, BookOutline } from "@/ai/schemas";
import { applyEntityDeltas, seedEntities, type EntitySeed } from "@/db/queries/entities";

/**
 * Builds the story bible before drafting starts.
 *
 * The problem this solves: without a canon established up front, chapter 9
 * invents a surname for a sister that chapter 2 never gave, or gives the hero's
 * sword a jewel it never had. So every entity is interrogated once — who are
 * they to the story, what do they do, what do they look like, what heritage do
 * they come from — and, crucially, names are *derived* from the entities they
 * are related to rather than picked in isolation.
 */

const bibleSchema = z.object({
  entities: z
    .array(
      z.object({
        kind: z.enum(ENTITY_KINDS),
        name: z.string(),
        aliases: z.array(z.string()).max(4).default([]),
        attrs: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .max(60),
  relationships: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum(RELATIONSHIP_TYPES),
        description: z.string().max(300).optional(),
      }),
    )
    .max(60)
    .default([]),
});

function bibleInstructions(): string {
  return [
    `You are a story bible editor. Before a word of prose is written you establish the canon that every chapter must honor.`,
    ``,
    `For each entity, answer the questions that keep a long book consistent:`,
    `- character: what are they to the story (protagonist, foil, obstacle)? what is their occupation? what would a reader picture when they appear? what cultural or regional heritage do they come from? how do they speak? what do they want, and what are they hiding?`,
    `- location: what kind of place is it, what does it physically contain, who owns it, how does it feel to be in?`,
    `- object: what does it look like in specific terms, where did it come from, who holds it, why does it matter?`,
    `- organization: what is it for, how is it structured, who belongs, how is it regarded?`,
    `- event: when does it occur, who takes part, what is the outcome?`,
    ``,
    `Naming is not decoration. Derive every name from the entity's heritage and from the names of entities it is related to — siblings and parents share surnames, a household's servants may carry regional names, a ship and its owner may echo each other. Record the reasoning in nameRationale. Never assign a name that contradicts an established family tie.`,
    ``,
    `Record relationships explicitly, especially family ties, ownership, and membership.`,
    `Be specific. "Tall and dark-haired" is useless; "a head taller than everyone in the room, with the family's heavy black brows" is canon.`,
  ].join("\n");
}

/**
 * Derives the initial cast and world. Runs once, after the outline, before any
 * chapter is drafted.
 */
export async function buildEntityBible(input: {
  meter: MeterCtx;
  bookId: string;
  tier: QualityTier;
  concept: BookConcept;
  outline: BookOutline;
  genre?: string;
  existingNames?: string[];
}): Promise<{ entityCount: number; relationshipCount: number }> {
  const model = MODELS[input.tier].summarizer;

  const chapterDigest = input.outline.chapters
    .map((c) => `${c.number}. ${c.title} — ${c.summary} [${c.charactersPresent.join(", ")}]`)
    .join("\n");

  const result = await metered(
    input.meter,
    { role: "entity-bible", operation: "entity.bible", model },
    () =>
      generateText({
        model,
        instructions: bibleInstructions(),
        prompt: [
          `## Book`,
          `${input.concept.title} — ${input.concept.logline}`,
          input.genre ? `Genre: ${input.genre}` : "",
          `Setting: ${input.concept.setting}`,
          `Central conflict: ${input.concept.centralConflict}`,
          ``,
          `## Cast from the concept`,
          input.concept.characters
            .map((c) => `- ${c.name} (${c.role}): ${c.description} Arc: ${c.arc}`)
            .join("\n"),
          ``,
          `## Chapter outline`,
          chapterDigest,
          ``,
          input.existingNames?.length
            ? `## Already in the bible — do not duplicate, and derive new names consistently with these\n${input.existingNames.join(", ")}`
            : "",
          ``,
          `Produce the story bible: every character named in the outline, every location the story visits, every object that carries weight, plus any organizations and named events. Then the relationships between them.`,
        ]
          .filter(Boolean)
          .join("\n"),
        output: Output.object({ schema: bibleSchema }),
        providerOptions: gatewayOptions(input.meter, "entity-bible"),
      }),
  );

  const bible = result.output;

  const seeds: EntitySeed[] = bible.entities.map((e) => ({
    kind: e.kind,
    name: e.name,
    aliases: e.aliases,
    attrs: e.attrs,
  }));
  await seedEntities(input.bookId, seeds);

  // Relationships are applied after the entities exist so both endpoints resolve.
  await applyEntityDeltas({
    bookId: input.bookId,
    newFacts: [],
    relationships: bible.relationships.map((r) => ({ from: r.from, to: r.to, type: r.type })),
  });

  return { entityCount: seeds.length, relationshipCount: bible.relationships.length };
}
