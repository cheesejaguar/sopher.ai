import { genreAudience, isNonFictionGenre, type GenreAudience } from "@/ai/knowledge/genres";
import type { GenerationInputSnapshot } from "@/lib/run-events";

const POV_LABELS: Record<NonNullable<GenerationInputSnapshot["pov"]>, string> = {
  first: "first person",
  third_limited: "third-person limited",
  third_omniscient: "third-person omniscient",
};

const HEAT_ORDER = ["none", "mild", "moderate", "explicit"] as const;
const VIOLENCE_ORDER = ["none", "mild", "moderate", "graphic"] as const;
const PROFANITY_ORDER = ["none", "mild", "moderate", "strong"] as const;

/**
 * The highest content level each audience may be written at, whatever the
 * project settings say.
 *
 * The shape step offers heat, violence and profanity unconditionally, so an
 * author can pick "Children's" and then leave violence on "graphic". Clamping
 * in the concept and outline prompts is not enough: this contract is the only
 * one the chapter writer and the revise pass receive, so an unclamped ceiling
 * here reaches the prose itself.
 */
const AUDIENCE_CEILINGS: Record<
  GenreAudience,
  { heat: number; violence: number; profanity: number }
> = {
  children: { heat: 0, violence: 0, profanity: 0 },
  middle_grade: { heat: 0, violence: 1, profanity: 0 },
  young_adult: { heat: 2, violence: 2, profanity: 2 },
  adult: { heat: 3, violence: 3, profanity: 3 },
};

function clamp<T extends readonly string[]>(
  order: T,
  value: T[number] | null | undefined,
  ceiling: number,
): T[number] | undefined {
  if (!value) return undefined;
  const index = order.indexOf(value);
  if (index < 0) return value;
  return order[Math.min(index, ceiling)];
}

/**
 * Plain-language contract shared by concept, outline, prose, and editing
 * prompts. Content levels are maxima, not instructions to add mature material.
 */
export function buildAuthoringGuidelines(input: GenerationInputSnapshot): string | undefined {
  const audience = genreAudience(input.genre);
  const ceilings = AUDIENCE_CEILINGS[audience];
  const heat = clamp(HEAT_ORDER, input.heatLevel, ceilings.heat);
  const violence = clamp(VIOLENCE_ORDER, input.violenceLevel, ceilings.violence);
  const profanity = clamp(PROFANITY_ORDER, input.profanity, ceilings.profanity);

  const lines = [
    input.pov ? `Point of view: ${POV_LABELS[input.pov]}.` : "",
    input.tense ? `Narrative tense: ${input.tense}.` : "",
    input.tone ? `Tone: ${input.tone}.` : "",
    input.styleProfile ? `Style profile: ${input.styleProfile}.` : "",
    audience === "children"
      ? `Written for children roughly 5-9 and often read aloud at bedtime. Short sentences, concrete nouns, nothing frightening, and a completely resolved, reassuring ending. These constraints outrank every other instruction here.`
      : "",
    audience === "middle_grade"
      ? `Written for readers roughly 8-12. No romance beyond a first crush, no on-page cruelty, and an ending that leaves hope. These constraints outrank every other instruction here.`
      : "",
    audience === "young_adult"
      ? `Written for readers roughly 13-18. Hard subjects are allowed, but never depicted admiringly. These constraints outrank every other instruction here.`
      : "",
    isNonFictionGenre(input.genre)
      ? `This is a true account, not fiction. Use only what the author supplied: never invent events, scenes, dialogue, or people, and never rename a real person. Where the record is thin, say so rather than filling it in.`
      : "",
    heat
      ? `Romantic/sexual content must not exceed the "${heat}" level; this is a ceiling, not a request to add it.`
      : "",
    violence
      ? `Violence must not exceed the "${violence}" level; this is a ceiling, not a request to add it.`
      : "",
    profanity
      ? `Profanity must not exceed the "${profanity}" level; this is a ceiling, not a request to add it.`
      : "",
    (input.avoidTopics ?? []).length > 0
      ? `Do not introduce these topics: ${(input.avoidTopics ?? []).join(", ")}.`
      : "",
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

/**
 * One frozen contract for every creative and rewriting agent in a durable run.
 * The explicit style/voice fields live beside safety and narrative constraints
 * so repair calls cannot accidentally receive a weaker contract.
 */
export function buildFrozenAuthoringContract(input: GenerationInputSnapshot): string | undefined {
  return (
    [
      input.styleGuide ? `Style guide: ${input.styleGuide}` : "",
      input.voiceProfile ? `Voice profile: ${input.voiceProfile}.` : "",
      buildAuthoringGuidelines(input) ?? "",
    ]
      .filter(Boolean)
      .join("\n") || undefined
  );
}
