import { z } from "zod";

/**
 * The story bible's entity model.
 *
 * Consistency drift in long books is rarely about plot — it is about details:
 * a character's eyes changing colour, a sword gaining a jewel it never had, a
 * house growing a room. Each kind therefore gets a purpose-built attribute
 * schema rather than a bag of free text, so the writer can be asked for
 * specific facts and the continuity pass has something concrete to check.
 *
 * Every kind carries `facts`, an append-only list. That shared channel is what
 * makes the atomic jsonb merge in `entityUpsert` possible across a wave of
 * concurrently drafting chapters.
 */

export const ENTITY_KINDS = ["character", "location", "object", "organization", "event"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** Accreted canon: short declarative statements later chapters must honour. */
const facts = z.array(z.string()).default([]);

export const characterAttrs = z.object({
  role: z.string().optional().describe("Role in the story — protagonist, foil, antagonist, etc."),
  background: z
    .string()
    .optional()
    .describe("Formative history and present circumstances before the story begins"),
  occupation: z.string().optional().describe("What they do for a living"),
  appearance: z.string().optional().describe("Physical description a reader would picture"),
  build: z.string().optional().describe("Height, frame, proportions, and movement"),
  face: z.string().optional().describe("Face shape and defining facial features"),
  hair: z.string().optional().describe("Hair color, texture, length, and styling"),
  eyes: z.string().optional().describe("Eye color, shape, and characteristic expression"),
  complexion: z.string().optional().describe("Skin tone and notable complexion details"),
  distinguishingFeatures: z
    .array(z.string())
    .default([])
    .describe("Scars, tattoos, assistive devices, or other stable identifying features"),
  wardrobe: z
    .string()
    .optional()
    .describe("Typical clothing, materials, colors, and recurring accessories"),
  posture: z.string().optional().describe("Habitual stance, gait, and physical bearing"),
  heritage: z
    .string()
    .optional()
    .describe("Cultural, ethnic or regional background informing name and speech"),
  age: z.string().optional(),
  speech: z.string().optional().describe("How they talk — register, verbal tics, dialect"),
  personality: z.array(z.string()).default([]),
  mannerisms: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  fears: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
  arc: z.string().optional().describe("How the character is expected to change"),
  nameRationale: z
    .string()
    .optional()
    .describe("Why this name — family ties, heritage, naming conventions it follows"),
  facts,
});

export const locationAttrs = z.object({
  locationType: z.string().optional().describe("House, tavern, city, ship, forest…"),
  description: z.string().optional(),
  features: z.array(z.string()).default([]).describe("Fixed, memorable characteristics"),
  contents: z
    .array(z.string())
    .default([])
    .describe("Notable things inside it — furniture, objects, rooms"),
  atmosphere: z.string().optional().describe("How the place feels to be in"),
  owner: z.string().optional().describe("Character or organization it belongs to"),
  facts,
});

export const objectAttrs = z.object({
  description: z.string().optional().describe("What it looks like, in specific terms"),
  significance: z.string().optional().describe("Why it matters to the story"),
  provenance: z.string().optional().describe("Where it came from, who made it"),
  holder: z.string().optional().describe("Who currently has it"),
  capabilities: z.array(z.string()).default([]).describe("What it can do, if anything"),
  facts,
});

export const organizationAttrs = z.object({
  purpose: z.string().optional(),
  structure: z.string().optional().describe("How it is organized and led"),
  members: z.array(z.string()).default([]),
  reputation: z.string().optional().describe("How outsiders regard it"),
  facts,
});

export const eventAttrs = z.object({
  when: z.string().optional().describe("When it happens relative to the story"),
  participants: z.array(z.string()).default([]),
  outcome: z.string().optional(),
  significance: z.string().optional(),
  facts,
});

export const ENTITY_ATTRS = {
  character: characterAttrs,
  location: locationAttrs,
  object: objectAttrs,
  organization: organizationAttrs,
  event: eventAttrs,
} as const;

export type EntityAttrs =
  | z.infer<typeof characterAttrs>
  | z.infer<typeof locationAttrs>
  | z.infer<typeof objectAttrs>
  | z.infer<typeof organizationAttrs>
  | z.infer<typeof eventAttrs>;

export function attrsSchemaFor(kind: EntityKind) {
  return ENTITY_ATTRS[kind];
}

/**
 * Parses attrs for a kind, dropping unknown or malformed fields individually.
 *
 * AI/tool input can be partially malformed. One bad list must not erase an
 * otherwise useful appearance or background from the same update.
 */
export function parseAttrs(kind: EntityKind, value: unknown): EntityAttrs {
  const schema = attrsSchemaFor(kind);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return schema.parse({}) as EntityAttrs;
  }

  const accepted: Record<string, unknown> = {};
  for (const [key, fieldSchema] of Object.entries(schema.shape)) {
    if (!(key in value)) continue;
    const parsed = (fieldSchema as z.ZodType).safeParse((value as Record<string, unknown>)[key]);
    if (parsed.success) accepted[key] = parsed.data;
  }
  return schema.parse(accepted) as EntityAttrs;
}

/**
 * Scalar attributes worth guarding. A change to one of these is a likely
 * continuity error (eyes changing colour); list-valued fields such as `facts`
 * or `personality` only ever accumulate and are never treated as conflicts.
 */
export const GUARDED_ATTRS: Record<EntityKind, string[]> = {
  character: [
    "appearance",
    "build",
    "face",
    "hair",
    "eyes",
    "complexion",
    "wardrobe",
    "posture",
    "heritage",
    "age",
    "occupation",
  ],
  location: ["locationType", "owner"],
  object: ["description", "provenance"],
  organization: ["purpose", "structure"],
  event: ["when", "outcome"],
};

export const RELATIONSHIP_TYPES = [
  "parent",
  "child",
  "sibling",
  "spouse",
  "friend",
  "rival",
  "enemy",
  "mentor",
  "employer",
  "member-of",
  "owns",
  "located-in",
  "created",
  "participated-in",
  "other",
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** Relationship kinds that imply a shared family name. Drives name derivation. */
export const FAMILY_RELATIONSHIPS: RelationshipType[] = ["parent", "child", "sibling", "spouse"];

/** Maps an entity kind onto the continuity_issues category vocabulary. */
export const KIND_TO_ISSUE_CATEGORY: Record<EntityKind, "character" | "setting" | "plot"> = {
  character: "character",
  location: "setting",
  object: "plot",
  organization: "setting",
  event: "plot",
};

const entityIdentity = {
  name: z.string().min(1).max(120),
  aliases: z.array(z.string()).max(8).default([]),
};

/** Typed input for tools that accept partial, kind-specific entity details. */
export const entityInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("character"),
    ...entityIdentity,
    attrs: characterAttrs.default(characterAttrs.parse({})),
  }),
  z.object({
    kind: z.literal("location"),
    ...entityIdentity,
    attrs: locationAttrs.default(locationAttrs.parse({})),
  }),
  z.object({
    kind: z.literal("object"),
    ...entityIdentity,
    attrs: objectAttrs.default(objectAttrs.parse({})),
  }),
  z.object({
    kind: z.literal("organization"),
    ...entityIdentity,
    attrs: organizationAttrs.default(organizationAttrs.parse({})),
  }),
  z.object({
    kind: z.literal("event"),
    ...entityIdentity,
    attrs: eventAttrs.default(eventAttrs.parse({})),
  }),
]);
export type EntityInput = z.infer<typeof entityInputSchema>;

/**
 * The pre-draft Bible is deliberately stricter than incremental entity tools.
 * Main characters must arrive as complete profiles; later chapter summaries
 * may still contribute partial deltas through the permissive schemas above.
 */
export const bibleCharacterAttrs = characterAttrs.extend({
  role: z.string().min(1),
  background: z.string().min(1),
  occupation: z.string().min(1),
  appearance: z.string().min(1),
  build: z.string().min(1),
  face: z.string().min(1),
  hair: z.string().min(1),
  eyes: z.string().min(1),
  complexion: z.string().min(1),
  distinguishingFeatures: z.array(z.string()).max(8).default([]),
  wardrobe: z.string().min(1),
  posture: z.string().min(1),
  heritage: z.string().min(1),
  age: z.string().min(1),
  speech: z.string().min(1),
  personality: z.array(z.string()).min(2).max(8),
  mannerisms: z.array(z.string()).max(8).default([]),
  goals: z.array(z.string()).min(1).max(6),
  fears: z.array(z.string()).max(6).default([]),
  secrets: z.array(z.string()).max(6).default([]),
  arc: z.string().min(1),
  nameRationale: z.string().min(1),
});

const bibleLocationAttrs = locationAttrs.extend({
  locationType: z.string().min(1),
  description: z.string().min(1),
  atmosphere: z.string().min(1),
});

const bibleObjectAttrs = objectAttrs.extend({
  description: z.string().min(1),
  significance: z.string().min(1),
});

const bibleOrganizationAttrs = organizationAttrs.extend({
  purpose: z.string().min(1),
  structure: z.string().min(1),
});

const bibleEventAttrs = eventAttrs.extend({
  when: z.string().min(1),
  outcome: z.string().min(1),
  significance: z.string().min(1),
});

/** Structured-output schema used by the story-bible agent. */
export const bibleEntitySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("character"),
    ...entityIdentity,
    attrs: bibleCharacterAttrs,
  }),
  z.object({
    kind: z.literal("location"),
    ...entityIdentity,
    attrs: bibleLocationAttrs,
  }),
  z.object({
    kind: z.literal("object"),
    ...entityIdentity,
    attrs: bibleObjectAttrs,
  }),
  z.object({
    kind: z.literal("organization"),
    ...entityIdentity,
    attrs: bibleOrganizationAttrs,
  }),
  z.object({
    kind: z.literal("event"),
    ...entityIdentity,
    attrs: bibleEventAttrs,
  }),
]);
