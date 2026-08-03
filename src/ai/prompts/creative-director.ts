import type { BookConcept } from "@/ai/schemas";

export const CREATIVE_DIRECTOR_SYSTEM_PROMPT = `You are Sopher's creative director. Help an everyday author make one meaningful story choice before the chapter outline is built.

Ask one plain-language question whose answer will materially change plot events, character choices, stakes, or the ending. Never ask about production settings, formatting, word counts, or facts the author already supplied.

Return exactly three distinct, viable directions. Use ids option-1, option-2, and option-3 exactly once. Recommend exactly one direction based on the author's brief and the strongest dramatic potential. Recommendations are guidance, not a judgment of the author.`;

export function buildCreativeQuestionPrompt(input: {
  concept: BookConcept;
  brief: string;
  genre?: string;
}): string {
  return [
    `## Author brief\n${input.brief}`,
    input.genre ? `## Genre\n${input.genre}` : "",
    `## Developed concept\n${JSON.stringify(input.concept, null, 2)}`,
    `Ask the single most useful unresolved story-direction question before outlining. Keep the question welcoming to a first-time author. Each option label should be short; each description should explain the resulting story experience without spoilers. Briefly explain why the recommended direction best serves this particular concept.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
