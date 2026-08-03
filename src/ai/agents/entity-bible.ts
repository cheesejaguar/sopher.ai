import { generateText, Output } from "ai";
import { z } from "zod";

import { withDbTransaction, type DbTransaction } from "@/db";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS, type QualityTier } from "@/ai/models";
import { bibleEntitySchema, RELATIONSHIP_TYPES } from "@/ai/schemas/entities";
import type { BookConcept, BookOutline } from "@/ai/schemas";
import { applyEntityDeltas, enrichEntities, type EntitySeed } from "@/db/queries/entities";

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
  entities: z.array(bibleEntitySchema).min(1).max(60),
  relationships: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum(RELATIONSHIP_TYPES),
        description: z
          .string()
          .min(1)
          .max(300)
          .describe("What this relationship means in this story, not merely its type"),
      }),
    )
    .max(60)
    .default([]),
});

export type GeneratedEntityBible = {
  entities: EntitySeed[];
  relationships: z.infer<typeof bibleSchema>["relationships"];
};

function bibleInstructions(): string {
  return [
    `You are a story bible editor. Before a word of prose is written you establish the canon that every chapter must honor.`,
    ``,
    `For each entity, answer the questions that keep a long book consistent:`,
    `- character: return a complete working profile, not a synopsis. Include their role, formative background, occupation, apparent age, heritage, speech, personality, goals, fears, secrets, mannerisms, and expected arc.`,
    `- character appearance: establish specific visual canon for overall appearance, height/build, face, hair, eyes, complexion, distinguishing features, typical wardrobe/accessories, posture, and movement. If a category does not conventionally apply, state the character-specific equivalent instead of omitting it.`,
    `- location: what kind of place is it, what does it physically contain, who owns it, how does it feel to be in?`,
    `- object: what does it look like in specific terms, where did it come from, who holds it, why does it matter?`,
    `- organization: what is it for, how is it structured, who belongs, how is it regarded?`,
    `- event: when does it occur, who takes part, what is the outcome?`,
    ``,
    `Naming is not decoration. Derive every name from the entity's heritage and from the names of entities it is related to — siblings and parents share surnames, a household's servants may carry regional names, a ship and its owner may echo each other. Record the reasoning in nameRationale. Never assign a name that contradicts an established family tie.`,
    ``,
    `Record relationships explicitly, especially family ties, ownership, and membership.`,
    `Give every relationship a concrete description of its history, tension, or practical meaning in this story.`,
    `Be specific. "Tall and dark-haired" is useless; "a head taller than everyone in the room, with the family's heavy black brows" is canon.`,
    `Every character in the concept cast must be returned under the exact established name with a complete profile, even if that name already exists in the database. Existing entries are starting points to enrich, not finished records to skip.`,
  ].join("\n");
}

/**
 * Derives the initial cast and world. Runs once, after the outline, before any
 * chapter is drafted.
 */
export async function generateEntityBible(input: {
  meter: MeterCtx;
  bookId: string;
  tier: QualityTier;
  concept: BookConcept;
  outline: BookOutline;
  genre?: string;
  authoringContract?: string;
  existingNames?: string[];
}): Promise<GeneratedEntityBible> {
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
          input.authoringContract ? `## Frozen authoring contract\n${input.authoringContract}` : "",
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
            ? `## Established names\nUse these exact names when they refer to the same entity; do not invent near-duplicates. Return and fully enrich every established main character from the concept cast.\n${input.existingNames.join(", ")}`
            : "",
          ``,
          `Produce the story bible: every character named in the outline, every location the story visits, every object that carries weight, plus any organizations and named events. Then the relationships between them.`,
        ]
          .filter(Boolean)
          .join("\n"),
        maxOutputTokens: meteredMaxOutputTokens("entity.bible"),
        prepareStep: meteredInputGuard("entity.bible"),
        output: Output.object({ schema: bibleSchema }),
        providerOptions: gatewayOptions(input.meter, "entity-bible"),
      }),
  );

  const bible = result.output;
  const returnedCharacters = new Set(
    bible.entities
      .filter((entity) => entity.kind === "character")
      .map((entity) => entity.name.trim().toLocaleLowerCase()),
  );
  const missingMainCharacters = input.concept.characters
    .map((character) => character.name.trim())
    .filter((name) => !returnedCharacters.has(name.toLocaleLowerCase()));
  if (missingMainCharacters.length > 0) {
    throw new Error(
      `Story bible omitted required main-character profiles: ${missingMainCharacters.join(", ")}`,
    );
  }

  const seeds: EntitySeed[] = bible.entities.map((e) => ({
    kind: e.kind,
    name: e.name,
    aliases: e.aliases,
    attrs: e.attrs,
  }));
  return { entities: seeds, relationships: bible.relationships };
}

export async function persistEntityBible(
  bookId: string,
  bible: GeneratedEntityBible,
  transaction?: DbTransaction,
): Promise<{ entityCount: number; relationshipCount: number }> {
  const persist = async (db: DbTransaction) => {
    await enrichEntities(bookId, bible.entities, db);
    // Relationships are applied after the entities exist so both endpoints resolve.
    await applyEntityDeltas(
      {
        bookId,
        newFacts: [],
        relationships: bible.relationships.map((r) => ({
          from: r.from,
          to: r.to,
          type: r.type,
          description: r.description,
        })),
      },
      db,
    );

    return {
      entityCount: bible.entities.length,
      relationshipCount: bible.relationships.length,
    };
  };
  return transaction ? persist(transaction) : withDbTransaction(persist);
}

export async function buildEntityBible(
  input: Parameters<typeof generateEntityBible>[0],
): Promise<{ entityCount: number; relationshipCount: number }> {
  const bible = await generateEntityBible(input);
  return persistEntityBible(input.bookId, bible);
}
