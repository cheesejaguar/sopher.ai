/**
 * Plain-English names for suggestion types, plus one sentence saying what each
 * one actually means.
 *
 * The stored `suggestionType` is the model's own vocabulary — "line",
 * "usage", "duplication" — which tells an author nothing. Every label the
 * editor shows comes from here so the panel, the card, and assistive
 * technology all describe a suggestion the same way.
 *
 * Kept free of `@/ai` imports on purpose: this ships to the client, and the
 * agent prompts are server-side kilobytes. `suggestion-glossary.test.ts`
 * cross-checks the keys against the categories the agents can actually emit.
 */

export type SuggestionGlossaryEntry = {
  /** Short human title, used as the visible label and section heading. */
  title: string;
  /** One sentence, addressed to the author, explaining what the type covers. */
  meaning: string;
};

export const SUGGESTION_GLOSSARY: Record<string, SuggestionGlossaryEntry> = {
  // Editorial review pass.
  line: {
    title: "Line edit",
    meaning: "A sentence-level polish for clarity, tightness, or rhythm.",
  },
  structure: {
    title: "Structure",
    meaning: "A change to how the scene is built — what happens where, and in what order.",
  },
  continuity: {
    title: "Continuity",
    meaning: "A detail here contradicts something established elsewhere in the book.",
  },
  style: {
    title: "Style",
    meaning: "A change to the texture of the prose — its tone, register, or repeated habits.",
  },
  // Selection edits the author asked for by hand.
  selection: {
    title: "Your request",
    meaning: "The rewrite you asked for on the passage you had selected.",
  },
  // Proofreading pass — mechanical correctness only.
  spelling: {
    title: "Spelling",
    meaning: "A misspelled or mistyped word.",
  },
  grammar: {
    title: "Grammar",
    meaning:
      "A grammar error, such as a verb that disagrees with its subject or a tense that slips mid-sentence.",
  },
  punctuation: {
    title: "Punctuation",
    meaning:
      "A punctuation error, such as a comma splice, a run-on sentence, or misplaced dialogue punctuation.",
  },
  usage: {
    title: "Word mix-up",
    meaning:
      "A correctly spelled word used in place of the one meant, like “its” for “it’s” or “their” for “there”.",
  },
  duplication: {
    title: "Repeated word",
    meaning: "A word or phrase written twice by accident.",
  },
  formatting: {
    title: "Spacing and capitals",
    meaning:
      "A spacing or capitalization slip, such as a double space or a lowercase sentence start.",
  },
};

/**
 * Entry for a stored suggestion type. An unknown type keeps its raw name
 * rather than being hidden — a suggestion with a mystery label is still worth
 * reading, and the generic sentence says as much.
 */
export function suggestionGlossaryEntry(type: string): SuggestionGlossaryEntry {
  return (
    SUGGESTION_GLOSSARY[type] ?? {
      title: type,
      meaning: "A suggested change to this passage.",
    }
  );
}

/** Visible label for a suggestion type. */
export function suggestionTypeLabel(type: string): string {
  return suggestionGlossaryEntry(type).title;
}
