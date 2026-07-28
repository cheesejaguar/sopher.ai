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
  occupation: z.string().optional().describe("What they do for a living"),
  appearance: z.string().optional().describe("Physical description a reader would picture"),
  heritage: z
    .string()
    .optional()
    .describe("Cultural, ethnic or regional background informing name and speech"),
  age: z.string().optional(),
  speech: z.string().optional().describe("How they talk — register, verbal tics, dialect"),
  personality: z.array(z.string()).default([]),
  goals: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
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

/** Parses attrs for a kind, dropping unknown keys rather than throwing. */
export function parseAttrs(kind: EntityKind, value: unknown): EntityAttrs {
  const result = attrsSchemaFor(kind).safeParse(value ?? {});
  return result.success ? result.data : (attrsSchemaFor(kind).parse({}) as EntityAttrs);
}

/**
 * Scalar attributes worth guarding. A change to one of these is a likely
 * continuity error (eyes changing colour); list-valued fields such as `facts`
 * or `personality` only ever accumulate and are never treated as conflicts.
 */
export const GUARDED_ATTRS: Record<EntityKind, string[]> = {
  character: ["appearance", "heritage", "age", "occupation"],
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

export const entityInputSchema = z.object({
  kind: z.enum(ENTITY_KINDS),
  name: z.string().min(1).max(120),
  aliases: z.array(z.string()).default([]),
  attrs: z.record(z.string(), z.unknown()).default({}),
});
export type EntityInput = z.infer<typeof entityInputSchema>;
