// Ported from .claude/skills/concept-generation/SKILL.md.
// String builders over the genre knowledge tables; no other runtime dependencies.

import { genreAudience, isNonFictionGenre, type GenreAudience } from "@/ai/knowledge/genres";

export const CONCEPT_SYSTEM_PROMPT = `# Concept Generation

You are an expert book concept developer and creative visionary. Your role is to take a brief book idea and expand it into a rich, detailed concept that will guide the entire writing process.

## Expertise

- Deep understanding of narrative structure across genres
- Ability to identify and develop compelling themes
- Skill in creating unique, marketable story hooks
- Knowledge of target audience expectations by genre

## When Given a Brief, You Should:

### 1. Identify Core Themes
- Extract the central message or question
- Develop supporting thematic elements
- Ensure themes resonate with target audience

### 2. Define the Setting
- Create vivid, immersive world details
- Establish time period and cultural context
- Identify unique environmental elements

### 3. Establish Tone and Voice
- Determine the emotional register
- Define narrative perspective recommendations
- Set expectations for prose style

### 4. Identify Target Audience
- Determine primary reader demographics
- Identify comparable titles (comp titles)
- Note genre conventions to embrace or subvert

### 5. Develop Central Conflict
- Define protagonist's core desire and obstacle
- Establish stakes (personal, societal, universal)
- Create compelling antagonistic forces

### 6. Suggest Unique Elements
- Identify what makes this book stand out
- Develop fresh perspectives on familiar tropes
- Create memorable hooks for marketing

## Response Format

Always respond with a valid JSON object containing:
- title: Working title for the book
- genre: Primary genre classification
- themes: List of major themes
- setting: Description of the primary setting
- time_period: When the story takes place
- tone: Emotional tone of the narrative
- target_audience: Description of ideal readers
- unique_elements: List of distinguishing features
- central_conflict: The core dramatic tension

Be specific and actionable in your concepts. Avoid vague generalities.`;

/**
 * The system prompt above is an Anthropic cache breakpoint and must stay
 * byte-identical for every run, so genre-derived framing lives here in the user
 * turn instead. The system prompt frames the job as expanding a brief into an
 * invented premise, world, and cast; for a true account the job is the opposite,
 * and this section has to say so explicitly to override it.
 */
export const NON_FICTION_CONCEPT_FRAMING = `## This Book Is Non-Fiction — Find It, Do Not Invent It

The brief describes things that actually happened to real people, so the concept work inverts:

- Do not invent a premise, a world, or a cast. Identify the true bounded subject the brief is circling — one thread of a life, statable in a single sentence — and say where it starts and ends.
- Name the driving question: what the narrator is trying to understand by telling this. It must be a question the author has not already answered, because certainty is what flattens this form.
- The cast is the real people the brief names or implies. Carry their names across exactly as given; never coin, complete, or "improve" a name the author did not supply. A person known only as "my grandmother" stays that.
- Setting is the actual places and period the events occurred in. The central conflict is the tension the narrator lived through, not a plot engine built to produce one.
- Unique elements are what makes this account worth reading — the access, the perspective, the honesty — not novel devices.
- Where the brief is too thin to support the subject, say what the author still needs to supply. Never fill the gap with invented incident.`;

/**
 * Age-band constraints for the concept phase. These are stated as overriding
 * project settings on purpose: an author can set violence to "graphic" and pick
 * a children's book, and the age band has to win that argument. Adult is absent
 * because it needs nothing said — which also keeps adult prompts unchanged.
 */
const AUDIENCE_CONCEPT_GUIDANCE: Partial<Record<GenreAudience, string>> = {
  children: `## Audience Constraints: Children (roughly ages 5-9)

These hold regardless of any content setting elsewhere in this prompt:

- Nothing sexual, no romance beyond friendship, no profanity, no substance use, no graphic injury, and no on-page death.
- One clear problem, small and concrete, that the child protagonist solves themselves. No subplots and no large cast.
- Danger is brief and always resolved. The book ends safe and warm.
- Tone and voice: short sentences and everyday words, with any unfamiliar word explained by the sentence around it.
- Themes stay within friendship, family, courage, and discovery.`,
  middle_grade: `## Audience Constraints: Middle Grade (roughly ages 8-12)

These hold regardless of any content setting elsewhere in this prompt:

- No sexual content, no explicit violence, no substance use, and no profanity beyond the mildest exclamation. Romance stops at a crush.
- Real difficulty belongs here — grief, divorce, unfairness, fear — handled without explicit detail and resolved with hope intact.
- The protagonist is at or just above the reader's age and drives the resolution; adults may help but must not rescue.
- Tone and voice: accessible sentences with varied rhythm; a harder word is fine when context carries it.`,
  young_adult: `## Audience Constraints: Young Adult (roughly ages 13-18)

These hold regardless of any content setting elsewhere in this prompt:

- Mature subject matter is in scope — identity, first love, loss, moral ambiguity — but intimacy stays off the page and violence stays non-graphic.
- Teen protagonist with real agency: adults may complicate the story, never resolve it.
- The emotional arc carries at least as much weight as the external plot.
- Tone and voice: voice-led prose. Complex sentences are welcome when the complexity is genuinely the narrator's, not an adult literary register borrowed over their head.`,
};

/**
 * The genre-derived sections every concept-phase call needs. Exported because
 * the refine pass builds its own user prompt and would otherwise re-invent a
 * memoir's cast after the expand pass got it right.
 */
export function conceptGenreFraming(genre?: string): string[] {
  const sections: string[] = [];
  if (isNonFictionGenre(genre)) sections.push(NON_FICTION_CONCEPT_FRAMING);
  const audience = AUDIENCE_CONCEPT_GUIDANCE[genreAudience(genre)];
  if (audience) sections.push(audience);
  return sections;
}

export interface ConceptPromptInput {
  /** Author-owned working title. The model may not replace it. */
  workingTitle?: string;
  /** The author's original book idea / brief. */
  brief: string;
  /** Genre the author selected, if any. Drives the non-fiction and age-band framing. */
  genre?: string;
  /** Target audience description from project settings. */
  targetAudience?: string;
  /** Rendered content-guidelines section (see content-filter.ts). */
  contentGuidelines?: string;
}

/** Build the user message for a concept-generation call. */
export function buildConceptUserPrompt(input: ConceptPromptInput): string {
  const nonFiction = isNonFictionGenre(input.genre);
  const parts: string[] = [`## Author Brief\n\n${input.brief}`];
  if (input.workingTitle) {
    parts.push(
      `## Working Title\n\n${input.workingTitle}\n\nPreserve this title exactly in the response.`,
    );
  }
  if (input.genre) {
    parts.push(`## Genre\n\n${input.genre}`);
  }
  if (input.targetAudience) {
    parts.push(`## Target Audience\n\n${input.targetAudience}`);
  }
  if (input.contentGuidelines) {
    parts.push(input.contentGuidelines);
  }
  // Last before the instruction: the genre-derived sections are the ones that
  // must survive a conflict with the author's own settings above.
  parts.push(...conceptGenreFraming(input.genre));
  parts.push(
    nonFiction
      ? "Develop this brief into a detailed concept for a true account, following your response format. Where the format asks for invention, report what is actually there instead."
      : "Expand this brief into a rich, detailed book concept following your response format.",
  );
  return parts.join("\n\n");
}
