import { generateText, Output } from "ai";
import { z } from "zod";

import { withDbTransaction, type DbTransaction } from "@/db";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS, type QualityTier } from "@/ai/models";
import { isNonFictionGenre } from "@/ai/knowledge/genres";
import {
  attrsSchemaFor,
  bibleEntitySchema,
  ENTITY_KINDS,
  RELATIONSHIP_TYPES,
  type EntityKind,
} from "@/ai/schemas/entities";
import {
  asRecord,
  coerceArray,
  coerceNonEmptyString,
  coerceStringArray,
  compact,
  oneOfOr,
  truncateArray,
  truncateString,
} from "@/ai/schemas/normalize";
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
 *
 * Non-fiction inverts that last part. In a memoir the people are real and their
 * names are facts the author supplied, so derivation becomes fabrication. The
 * override rides in the user prompt, never the instructions, because the
 * instructions are a prompt-cache prefix that must not vary per book.
 */

/**
 * The strict story bible. Exported so the test suite can prove, payload by
 * payload, which plausible answers this schema used to reject outright.
 *
 * Almost every bound here is invisible to the provider: Anthropic's
 * structured-output path strips `.min` / `.max` / `.length` and does not
 * enforce `z.enum`, so the model is held to caps it was never shown. That makes
 * a rejection deterministic — the retry produces the same answer — and this
 * call runs before a single chapter exists, outside the workflow's degradation
 * boundary, so the failure kills the whole run. `bibleWireSchema` goes to the
 * provider instead and `normalizeBible` lands the answer back here.
 */
export const bibleSchema = z.object({
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

/* -------------------------------------------------------------------------- */
/* Wire schema and normalizer                                                  */
/* -------------------------------------------------------------------------- */

const MAX_BIBLE_ENTITIES = 60;
const MAX_BIBLE_RELATIONSHIPS = 60;
const MAX_ENTITY_NAME_CHARS = 120;
const MAX_ENTITY_ALIASES = 8;
const MAX_RELATIONSHIP_DESCRIPTION_CHARS = 300;

/** The per-attribute list caps `bibleCharacterAttrs` declares and cannot show. */
const ATTR_LIST_CAPS: Record<string, number> = {
  distinguishingFeatures: 8,
  personality: 8,
  mannerisms: 8,
  goals: 6,
  fears: 6,
  secrets: 6,
};

/**
 * Where an unrecognized `kind` lands when neither the concept cast nor the
 * attributes identify it. Of the five it claims the least: a "creature" filed as
 * an object asserts only that the thing exists and matters, where filing it as a
 * character would put it in the cast every chapter writer reads from and hand it
 * a person's profile fields.
 */
const FALLBACK_ENTITY_KIND: EntityKind = "object";

const wireText = z.string().nullish();
const wireTextArray = z.array(z.string().nullish()).nullish();

/**
 * Every kind's attributes in one flat, optional object.
 *
 * The strict schema is a discriminated union, which fails wholesale on a
 * discriminator it does not know — and `kind` is exactly the field the provider
 * does not enforce. Flattening keeps a mis-kinded entity's details readable
 * instead of throwing the entity away with them; `normalizeBible` then keeps
 * only the fields that belong to the kind it settled on.
 */
const bibleWireAttrsSchema = z.object({
  role: wireText.describe("Role in the story — protagonist, foil, antagonist, etc."),
  background: wireText.describe(
    "Formative history and present circumstances before the story begins",
  ),
  occupation: wireText.describe("What they do for a living"),
  appearance: wireText.describe("Physical description a reader would picture"),
  build: wireText.describe("Height, frame, proportions, and movement"),
  face: wireText.describe("Face shape and defining facial features"),
  hair: wireText.describe("Hair color, texture, length, and styling"),
  eyes: wireText.describe("Eye color, shape, and characteristic expression"),
  complexion: wireText.describe("Skin tone and notable complexion details"),
  distinguishingFeatures: wireTextArray.describe(
    "Scars, tattoos, assistive devices, or other stable identifying features — at most 8",
  ),
  wardrobe: wireText.describe("Typical clothing, materials, colors, and recurring accessories"),
  posture: wireText.describe("Habitual stance, gait, and physical bearing"),
  heritage: wireText.describe("Cultural, ethnic or regional background informing name and speech"),
  age: wireText,
  speech: wireText.describe("How they talk — register, verbal tics, dialect"),
  personality: wireTextArray.describe("Two to eight traits"),
  mannerisms: wireTextArray.describe("At most 8"),
  goals: wireTextArray.describe("One to six goals"),
  fears: wireTextArray.describe("At most 6"),
  secrets: wireTextArray.describe("At most 6"),
  arc: wireText.describe("How the character is expected to change"),
  nameRationale: wireText.describe(
    "Why this name — family ties, heritage, naming conventions it follows",
  ),
  locationType: wireText.describe("House, tavern, city, ship, forest…"),
  description: wireText.describe("What it looks like, in specific terms"),
  features: wireTextArray.describe("Fixed, memorable characteristics"),
  contents: wireTextArray.describe("Notable things inside it — furniture, objects, rooms"),
  atmosphere: wireText.describe("How the place feels to be in"),
  owner: wireText.describe("Character or organization it belongs to"),
  significance: wireText.describe("Why it matters to the story"),
  provenance: wireText.describe("Where it came from, who made it"),
  holder: wireText.describe("Who currently has it"),
  capabilities: wireTextArray.describe("What it can do, if anything"),
  purpose: wireText,
  structure: wireText.describe("How it is organized and led"),
  members: wireTextArray,
  reputation: wireText.describe("How outsiders regard it"),
  when: wireText.describe("When it happens relative to the story"),
  participants: wireTextArray,
  outcome: wireText,
  facts: wireTextArray.describe("Short declarative statements later chapters must honour"),
});

/** Restores the per-kind grouping the flat attrs object gives up. */
const ATTRS_FIELD_GUIDE = [
  "Fill only the fields that belong to this entity's kind.",
  "character — role, background, occupation, appearance, build, face, hair, eyes, complexion,",
  "distinguishingFeatures, wardrobe, posture, heritage, age, speech, personality, mannerisms,",
  "goals, fears, secrets, arc, nameRationale;",
  "location — locationType, description, features, contents, atmosphere, owner;",
  "object — description, significance, provenance, holder, capabilities;",
  "organization — purpose, structure, members, reputation;",
  "event — when, participants, outcome, significance.",
  "Any kind may also carry facts.",
].join(" ");

/**
 * What the provider is actually shown: no bounds, no enums, every field
 * optional and nullable. JSON-schema validation is all-or-nothing, so a single
 * omitted field would otherwise discard a whole bible the normalizer could have
 * salvaged entity by entity. The caps live in `.describe()` text, which does
 * survive into the provider's schema.
 */
export const bibleWireSchema = z.object({
  entities: z
    .array(
      z.object({
        kind: wireText.describe(`One of: ${ENTITY_KINDS.join(", ")}`),
        name: wireText.describe(
          `The established name, at most ${MAX_ENTITY_NAME_CHARS} characters`,
        ),
        aliases: wireTextArray.describe(
          `Other names this entity goes by, at most ${MAX_ENTITY_ALIASES}`,
        ),
        attrs: bibleWireAttrsSchema.nullish().describe(ATTRS_FIELD_GUIDE),
      }),
    )
    .nullish()
    .describe(`At most ${MAX_BIBLE_ENTITIES} entities, most important first`),
  relationships: z
    .array(
      z.object({
        from: wireText.describe("The exact name of the entity the relationship starts from"),
        to: wireText.describe("The exact name of the entity it points to"),
        type: wireText.describe(`One of: ${RELATIONSHIP_TYPES.join(", ")}`),
        description: wireText.describe(
          `What this relationship means in this story, not merely its type — at most ${MAX_RELATIONSHIP_DESCRIPTION_CHARS} characters`,
        ),
      }),
    )
    .nullish()
    .describe(`At most ${MAX_BIBLE_RELATIONSHIPS} relationships`),
});
export type BibleWire = z.infer<typeof bibleWireSchema>;

/**
 * Keeps the attributes that belong to `kind`, coerced onto the shapes
 * `parseAttrs` will accept at persist time.
 *
 * List-valued fields are detected by asking the field schema whether it accepts
 * an empty array rather than by reading zod internals, so a new attribute in
 * `src/ai/schemas/entities.ts` is handled here the day it is added.
 */
function normalizeBibleAttrs(kind: EntityKind, wire: unknown): Record<string, unknown> {
  const shape = attrsSchemaFor(kind).shape;
  const source = asRecord(wire);
  const attrs: Record<string, unknown> = {};

  for (const [key, fieldSchema] of Object.entries(shape)) {
    if ((fieldSchema as z.ZodType).safeParse([]).success) {
      const cap = ATTR_LIST_CAPS[key];
      const values = coerceStringArray(source[key]);
      const list = cap === undefined ? values : truncateArray(values, cap);
      if (list.length > 0) attrs[key] = list;
      continue;
    }
    // An empty string is not canon — it would occupy a profile slot a later
    // chapter could otherwise fill, so it is left out rather than written down.
    const text = coerceNonEmptyString(source[key]);
    if (text) attrs[key] = text;
  }

  return attrs;
}

/** Reserved sentinel: `oneOfOr` cannot otherwise report that it fell back. */
const UNKNOWN_ENTITY_KIND = "unknown" as const;

/**
 * Which kinds declare each attribute name, read off the schemas rather than
 * hand-listed so an attribute added to `src/ai/schemas/entities.ts` counts here
 * the day it is added.
 */
const ATTR_KIND_OWNERS: ReadonlyMap<string, readonly EntityKind[]> = (() => {
  const owners = new Map<string, EntityKind[]>();
  for (const kind of ENTITY_KINDS) {
    for (const key of Object.keys(attrsSchemaFor(kind).shape)) {
      const kinds = owners.get(key);
      if (kinds) kinds.push(kind);
      else owners.set(key, [kind]);
    }
  }
  return owners;
})();

/**
 * Votes are integers so a tie is exact rather than a float comparison: 60
 * divides evenly by every number of kinds an attribute can belong to.
 */
const ATTR_VOTE_SCALE = 60;

/**
 * Reads the kind back off the attributes the model actually filled in.
 *
 * The attribute groups are keyed by kind, so a wrong kind does not merely
 * mislabel an entity — `normalizeBibleAttrs` then drops every field belonging to
 * the kind it really was, and a character answered as "protagonist" arrives with
 * a full profile and leaves with nothing. Which group the model answered is the
 * evidence of which group it meant, so the populated fields vote: a field only
 * one kind declares is a whole vote, one two kinds share is half a vote each,
 * and `facts` — carried by every kind — is evidence of none of them. A tie is
 * genuine ambiguity and is left to the caller's fallback.
 */
function inferEntityKindFromAttrs(wire: unknown): EntityKind | null {
  const source = asRecord(wire);
  const votes = new Map<EntityKind, number>();

  for (const [key, value] of Object.entries(source)) {
    const owners = ATTR_KIND_OWNERS.get(key);
    if (!owners || owners.length === ENTITY_KINDS.length) continue;
    // Only a value `normalizeBibleAttrs` would keep is an answer; a blank or a
    // non-string is the model declining the field, not choosing the kind.
    if (!coerceNonEmptyString(value) && coerceStringArray(value).length === 0) continue;
    const vote = ATTR_VOTE_SCALE / owners.length;
    for (const kind of owners) votes.set(kind, (votes.get(kind) ?? 0) + vote);
  }

  let winner: EntityKind | null = null;
  let best = 0;
  let tied = false;
  for (const [kind, score] of votes) {
    if (score > best) {
      best = score;
      winner = kind;
      tied = false;
    } else if (score === best) {
      tied = true;
    }
  }
  return tied ? null : winner;
}

function normalizeEntityKind(
  wire: unknown,
  name: string,
  attrs: unknown,
  castNames: ReadonlySet<string>,
): EntityKind {
  const kind = oneOfOr<EntityKind | typeof UNKNOWN_ENTITY_KIND>(
    wire,
    ENTITY_KINDS,
    UNKNOWN_ENTITY_KIND,
  );
  if (kind !== UNKNOWN_ENTITY_KIND) return kind;
  // The label meant nothing, but the name may still be one the author supplied.
  // Reading the concept's own cast is not a guess, and it matters: a main
  // character filed anywhere but "character" trips the completeness gate below
  // and kills the run this normalizer exists to keep alive. It outranks the
  // profile below because the author's cast list is fact and the profile is
  // model output.
  if (castNames.has(name.trim().toLocaleLowerCase())) return "character";
  return inferEntityKindFromAttrs(attrs) ?? FALLBACK_ENTITY_KIND;
}

function normalizeBibleEntity(wire: unknown, castNames: ReadonlySet<string>): EntitySeed | null {
  const entity = asRecord(wire);
  const name = coerceNonEmptyString(entity.name);
  // The bible is keyed by name: an unnamed entity cannot be enriched, looked up
  // by a chapter writer, or pointed at by a relationship. Naming it here would
  // be inventing canon every later chapter then has to honour, so it is dropped.
  if (!name) return null;

  const trimmed = truncateString(name, MAX_ENTITY_NAME_CHARS);
  const kind = normalizeEntityKind(entity.kind, trimmed, entity.attrs, castNames);
  return {
    kind,
    name: trimmed,
    aliases: truncateArray(coerceStringArray(entity.aliases), MAX_ENTITY_ALIASES),
    attrs: normalizeBibleAttrs(kind, entity.attrs),
  };
}

/**
 * Resolves a relationship endpoint to the exact name of a surviving entity.
 *
 * Real names win over aliases, and the entity's own spelling is returned, so
 * "the salt ledger" reaches the same row as "The Salt Ledger" — `enrichEntities`
 * and `applyEntityDeltas` both prefer an exact-case match.
 */
function entityResolver(entities: EntitySeed[]): (name: string) => string | null {
  const canonical = new Map<string, string>();
  const remember = (key: string, name: string) => {
    const normalized = key.trim().toLocaleLowerCase();
    if (normalized && !canonical.has(normalized)) canonical.set(normalized, name);
  };
  for (const entity of entities) remember(entity.name, entity.name);
  for (const entity of entities) {
    for (const alias of entity.aliases ?? []) remember(alias, entity.name);
  }
  return (name) => canonical.get(name.trim().toLocaleLowerCase()) ?? null;
}

function normalizeBibleRelationship(
  wire: unknown,
  resolve: (name: string) => string | null,
): GeneratedEntityBible["relationships"][number] | null {
  const relationship = asRecord(wire);
  const fromName = coerceNonEmptyString(relationship.from);
  const toName = coerceNonEmptyString(relationship.to);
  if (!fromName || !toName) return null;

  const from = resolve(fromName);
  const to = resolve(toName);
  // An endpoint no surviving entity answers to links nothing — the row would be
  // dropped again at persist time, and inventing the missing end would put a
  // person in the bible the story never had. A loop back to the same entity is
  // not a relationship either.
  if (!from || !to || from === to) return null;

  const description = coerceNonEmptyString(relationship.description);
  return {
    from,
    to,
    type: oneOfOr(relationship.type, RELATIONSHIP_TYPES, "other"),
    // The tie itself is the canon that drives name derivation and continuity
    // checks; losing "Mira — sibling — Coran" because the model skipped the
    // prose would cost more than the prose does. Empty says only that the model
    // said nothing about what the tie means, which is true.
    description: description ? truncateString(description, MAX_RELATIONSHIP_DESCRIPTION_CHARS) : "",
  };
}

/**
 * Pulls a wire bible back onto the strict domain shape. Total: no input throws,
 * and no rejected value is ever surfaced — model output here carries character
 * profiles and plot secrets that must not reach a log line or a stored error.
 *
 * `characterNames` is the concept's own cast, used only to recognize a
 * main character whose `kind` came back as a label outside the enum.
 */
export function normalizeBible(
  wire: unknown,
  options: { characterNames?: readonly string[] } = {},
): GeneratedEntityBible {
  const value = asRecord(wire);
  const castNames = new Set(
    compact((options.characterNames ?? []).map((name) => coerceNonEmptyString(name))).map((name) =>
      name.toLocaleLowerCase(),
    ),
  );

  const entities = truncateArray(
    compact(coerceArray(value.entities).map((entity) => normalizeBibleEntity(entity, castNames))),
    MAX_BIBLE_ENTITIES,
  );
  // Endpoints resolve against the entities that survived the cap, so a
  // relationship pointing past it goes with them.
  const resolve = entityResolver(entities);

  return {
    entities,
    relationships: truncateArray(
      compact(
        coerceArray(value.relationships).map((relationship) =>
          normalizeBibleRelationship(relationship, resolve),
        ),
      ),
      MAX_BIBLE_RELATIONSHIPS,
    ),
  };
}

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

/** Cancels the name-derivation and gap-filling mandates for a true account. */
const NON_FICTION_BIBLE_OVERRIDE = [
  `## This Is A True Account — Names And Facts Are Given, Not Derived`,
  `Everyone and everywhere in this book is real. Where your instructions describe deriving names and establishing canon, the following replaces that:`,
  `- Use exactly the names the concept and outline supply. Never derive, complete, regularize, or "improve" a name, and never coin one from heritage, family ties, or region.`,
  `- Someone who appears without a full name keeps the name they were given — a first name, a role, "my grandmother". An incomplete real name is correct; an invented surname is an error.`,
  `- Record only the relationships the source states. Do not infer a shared surname from a stated family tie, or a tie from a shared surname.`,
  `- nameRationale records where the name came from in the author's material, not how it was constructed.`,
  `- Do not add people, places, objects, organizations, or events the concept and outline do not contain.`,
  `- Attributes come from the material. Where appearance, background, or heritage is not established, say so plainly instead of filling it in — a plausible invention here becomes false canon every later chapter repeats.`,
].join("\n");

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
          // Last before the instruction, so it wins any conflict with the
          // fiction-shaped guidance above it.
          isNonFictionGenre(input.genre) ? NON_FICTION_BIBLE_OVERRIDE : "",
          ``,
          `Produce the story bible: every character named in the outline, every location the story visits, every object that carries weight, plus any organizations and named events. Then the relationships between them.`,
        ]
          .filter(Boolean)
          .join("\n"),
        maxOutputTokens: meteredMaxOutputTokens("entity.bible"),
        prepareStep: meteredInputGuard("entity.bible"),
        // The permissive wire schema, never `bibleSchema`: the strict one
        // carries caps and enums the provider strips, so a bible with 61
        // entities, a 400-character relationship description, or a "creature"
        // threw NoObjectGeneratedError, retried identically, and killed the run
        // before a single chapter had been written. `normalizeBible` puts the
        // answer back on the strict shape below.
        output: Output.object({ schema: bibleWireSchema }),
        providerOptions: gatewayOptions(input.meter, "entity-bible"),
      }),
  );

  const bible = normalizeBible(result.output, {
    characterNames: input.concept.characters.map((character) => character.name),
  });
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

  return bible;
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
