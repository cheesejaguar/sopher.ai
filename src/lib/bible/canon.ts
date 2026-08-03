import type { EntityKind } from "@/ai/schemas/entities";

export type EditableEntityCanon = {
  name: string;
  aliases: string[];
  appearance: string;
  background: string;
  goals: string[];
  personality: string[];
  voice: string;
  arc: string;
  facts: string[];
};

const KIND_ATTR_KEYS: Record<
  EntityKind,
  { appearance: string; background: string; voice: string }
> = {
  character: { appearance: "appearance", background: "background", voice: "speech" },
  location: { appearance: "description", background: "background", voice: "voice" },
  object: { appearance: "description", background: "provenance", voice: "voice" },
  organization: { appearance: "appearance", background: "background", voice: "voice" },
  event: { appearance: "appearance", background: "background", voice: "voice" },
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function list(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/** Maps kind-specific generated attributes onto the author's shared canon form. */
export function editableCanonFromAttrs(input: {
  kind: EntityKind;
  name: string;
  aliases: string[];
  attrs: Record<string, unknown>;
}): EditableEntityCanon {
  const keys = KIND_ATTR_KEYS[input.kind];
  return {
    name: input.name,
    aliases: input.aliases,
    appearance: text(input.attrs[keys.appearance]),
    background: text(input.attrs[keys.background]),
    goals: list(input.attrs.goals),
    personality: list(input.attrs.personality),
    voice: text(input.attrs[keys.voice]),
    arc: text(input.attrs.arc),
    facts: list(input.attrs.facts),
  };
}

/**
 * Produces only the fields owned by the author-facing canon form. Database
 * mutation merges this patch into the existing JSON object after removing the
 * same controlled keys, so richer generated details and future attributes are
 * never discarded by an edit.
 */
export function editableCanonAttrsPatch(
  kind: EntityKind,
  input: Omit<EditableEntityCanon, "name" | "aliases">,
): Record<string, unknown> {
  const keys = KIND_ATTR_KEYS[kind];
  const patch: Record<string, unknown> = {};
  if (input.appearance.trim()) patch[keys.appearance] = input.appearance.trim();
  if (input.background.trim()) patch[keys.background] = input.background.trim();
  if (input.goals.length > 0) patch.goals = input.goals;
  if (input.personality.length > 0) patch.personality = input.personality;
  if (input.voice.trim()) patch[keys.voice] = input.voice.trim();
  if (input.arc.trim()) patch.arc = input.arc.trim();
  if (input.facts.length > 0) patch.facts = input.facts;
  return patch;
}

export function editableCanonAttrKeys(kind: EntityKind): string[] {
  const keys = KIND_ATTR_KEYS[kind];
  return [
    ...new Set([
      keys.appearance,
      keys.background,
      keys.voice,
      "goals",
      "personality",
      "arc",
      "facts",
    ]),
  ];
}

/** Pure equivalent of the JSONB merge used by the server action. */
export function mergeEditableCanonAttrs(
  existing: Record<string, unknown>,
  kind: EntityKind,
  input: Omit<EditableEntityCanon, "name" | "aliases">,
): Record<string, unknown> {
  const next = { ...existing };
  for (const key of editableCanonAttrKeys(kind)) delete next[key];
  return { ...next, ...editableCanonAttrsPatch(kind, input) };
}
