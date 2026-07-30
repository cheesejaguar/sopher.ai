import type { GenerationInputSnapshot } from "@/lib/run-events";

const POV_LABELS: Record<NonNullable<GenerationInputSnapshot["pov"]>, string> = {
  first: "first person",
  third_limited: "third-person limited",
  third_omniscient: "third-person omniscient",
};

/**
 * Plain-language contract shared by concept, outline, prose, and editing
 * prompts. Content levels are maxima, not instructions to add mature material.
 */
export function buildAuthoringGuidelines(input: GenerationInputSnapshot): string | undefined {
  const lines = [
    input.pov ? `Point of view: ${POV_LABELS[input.pov]}.` : "",
    input.tense ? `Narrative tense: ${input.tense}.` : "",
    input.tone ? `Tone: ${input.tone}.` : "",
    input.styleProfile ? `Style profile: ${input.styleProfile}.` : "",
    input.heatLevel
      ? `Romantic/sexual content must not exceed the "${input.heatLevel}" level; this is a ceiling, not a request to add it.`
      : "",
    input.violenceLevel
      ? `Violence must not exceed the "${input.violenceLevel}" level; this is a ceiling, not a request to add it.`
      : "",
    input.profanity
      ? `Profanity must not exceed the "${input.profanity}" level; this is a ceiling, not a request to add it.`
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
