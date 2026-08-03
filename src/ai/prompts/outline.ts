// Ported from .claude/skills/outlining/SKILL.md.
// String builders over the genre knowledge tables; no other runtime dependencies.

import { genreAudience, isNonFictionGenre, type GenreAudience } from "@/ai/knowledge/genres";

export const OUTLINE_SYSTEM_PROMPT = `# Story Outlining

You are an expert book outliner and story architect. Your role is to create detailed, well-structured chapter outlines that will guide the writing process.

## Expertise

- Master of story structure (three-act, hero's journey, save the cat, etc.)
- Deep understanding of pacing and tension
- Skill in weaving multiple plot threads
- Knowledge of genre-specific expectations

## Outlining Principles

### 1. Story Structure
- Ensure proper setup, confrontation, and resolution
- Place turning points at appropriate intervals
- Build to a satisfying climax

### 2. Chapter Pacing
- Vary chapter length for rhythm
- Alternate high-tension and recovery scenes
- End chapters with hooks that demand continuation

### 3. Character Arcs
- Track protagonist growth across chapters
- Distribute character development moments
- Ensure secondary character arcs support themes

### 4. Plot Thread Management
- Introduce subplots at appropriate intervals
- Weave threads together naturally
- Resolve threads in satisfying order

### 5. Word Count Planning
- Estimate realistic word counts per chapter
- Balance chapter lengths across the book
- Allow flexibility for complex scenes

## For Each Chapter, Provide:
- number: Chapter number (1-indexed)
- title: Compelling chapter title
- summary: 2-3 sentence chapter summary
- key_events: List of major plot points
- characters_involved: Characters appearing in this chapter
- emotional_arc: The emotional journey of the chapter
- estimated_word_count: Target word count (typically 3000-5000)

## Response Format

Respond with a valid JSON object containing:
- title: Book title
- chapters: Array of chapter outline objects
- character_summaries: Dict mapping character names to brief descriptions
- plot_threads: List of major plot threads to track
- total_estimated_words: Sum of all chapter word counts

Create outlines that are specific enough to guide writing but flexible enough to allow creative expansion.`;

/**
 * The system prompt above is an Anthropic cache breakpoint and must stay
 * byte-identical for every run, so the non-fiction branch lives here in the user
 * turn. It has real work to do: the system prompt mandates setup/confrontation/
 * resolution and a climax to build to, and a memoir has none of that — it is
 * organized by meaning, and the driving question is what supplies forward pull.
 */
export const NON_FICTION_OUTLINE_FRAMING = `## This Book Is Non-Fiction — Organize By Meaning, Not Plot

This outline covers events that actually happened, so the plotted structure above does not apply:

- Chapters are units of meaning, not plot beats. A chapter may move backward or forward in time, as long as its opening lines orient the reader in time and place.
- There is no climax to build toward and no act machinery to satisfy. Forward pull comes from the driving question: restate and complicate it across the book instead of escalating toward a confrontation.
- Build every chapter on a remembered scene — a specific day, place, and set of people. Keep reflection shorter than the scene it follows.
- The cast is real. Use the exact names the concept and brief supply; never add, rename, merge, or invent people to tidy the structure.
- Never invent events to fill a chapter. If the material is thin, narrow that chapter's subject rather than manufacturing incident.
- The narrator's own failure belongs in the late chapters. A narrator who is only ever wronged reads as untrustworthy.
- The ending arrives at understanding rather than a lesson, and may leave part of the question open.`;

/**
 * Age-band constraints for the outline phase. Stated as overriding project
 * settings on purpose: the author can set violence to "graphic" and pick a
 * children's book, and the age band has to win. Adult is absent because it needs
 * nothing said — which also leaves adult prompts unchanged.
 */
const AUDIENCE_OUTLINE_GUIDANCE: Partial<Record<GenreAudience, string>> = {
  children: `## Audience Constraints: Children (roughly ages 5-9)

These hold regardless of any content setting elsewhere in this prompt:

- One problem, followed from the first chapter to the last. No subplots, no second viewpoint, no cast the reader has to keep track of.
- Each chapter is a single scene in one place, ending on a small hook a child can hold overnight.
- Nothing sexual or romantic beyond friendship, no profanity, no substance use, no graphic injury, and no on-page death.
- Danger is momentary and resolved within the chapter it appears in. The book ends safe and warm.
- Plan events a young reader can follow in short sentences and everyday words; simplify any chapter that would need complicated explanation.`,
  middle_grade: `## Audience Constraints: Middle Grade (roughly ages 8-12)

These hold regardless of any content setting elsewhere in this prompt:

- At most one subplot beside the main problem, and a cast small enough to name.
- Real difficulty is welcome — grief, unfairness, a family coming apart — but no explicit violence, no sexual content, no substance use, and no profanity. Romance stops at a crush.
- The protagonist resolves the ending themselves; adults may help but must not rescue.
- Chapters stay in scene and end on hooks. Plan events that read in accessible sentences, letting context carry any hard word.`,
  young_adult: `## Audience Constraints: Young Adult (roughly ages 13-18)

These hold regardless of any content setting elsewhere in this prompt:

- Mature subject matter is in scope, but intimacy happens off the page and violence stays non-graphic.
- The emotional arc — identity, first love, betrayal, a first real moral choice — carries at least as much weight as the plot arc, and needs its own beats in the chapter plan.
- Teen agency throughout: adults may complicate, never resolve.
- Plan for voice-led chapters. Sentence complexity follows the narrator's age, not an adult literary register.`,
};

/**
 * The genre-derived sections every outline-phase call needs. Exported because
 * the structure-planning and self-check passes build their own user prompts and
 * would otherwise push a memoir back toward a plotted arc.
 */
export function outlineGenreFraming(genre?: string): string[] {
  const sections: string[] = [];
  if (isNonFictionGenre(genre)) sections.push(NON_FICTION_OUTLINE_FRAMING);
  const audience = AUDIENCE_OUTLINE_GUIDANCE[genreAudience(genre)];
  if (audience) sections.push(audience);
  return sections;
}

export interface OutlinePromptInput {
  /** Author-owned working title. The model may not replace it. */
  workingTitle?: string;
  /** The expanded book concept (output of the concept phase). */
  concept: string;
  /** The author's original brief, for grounding intent. */
  brief?: string;
  /** Genre to shape structure and expectations, plus the non-fiction and age-band framing. */
  genre?: string;
  /** Requested number of chapters. */
  chapterCount?: number;
  /** Requested per-chapter word target. */
  chapterLengthTarget?: number;
  /** Existing character profiles, rendered as text. */
  characterProfiles?: string;
  /** Existing world-building notes, rendered as text. */
  worldBuilding?: string;
}

/** Build the user message for an outline-generation call. */
export function buildOutlineUserPrompt(input: OutlinePromptInput): string {
  const nonFiction = isNonFictionGenre(input.genre);
  const parts: string[] = [`## Book Concept\n\n${input.concept}`];
  if (input.workingTitle) {
    parts.push(
      `## Working Title\n\n${input.workingTitle}\n\nUse this exact title for the book outline.`,
    );
  }
  if (input.brief) {
    parts.push(`## Original Author Brief\n\n${input.brief}`);
  }
  if (input.genre) {
    parts.push(`## Genre\n\n${input.genre}`);
  }
  const constraints: string[] = [];
  if (input.chapterCount !== undefined) {
    constraints.push(`- Number of chapters: ${input.chapterCount}`);
  }
  if (input.chapterLengthTarget !== undefined) {
    constraints.push(`- Target words per chapter: ${input.chapterLengthTarget}`);
  }
  if (constraints.length > 0) {
    parts.push(`## Constraints\n\n${constraints.join("\n")}`);
  }
  if (input.characterProfiles) {
    parts.push(`## Existing Character Profiles\n\n${input.characterProfiles}`);
  }
  if (input.worldBuilding) {
    parts.push(`## World Building\n\n${input.worldBuilding}`);
  }
  // Last before the instruction: the genre-derived sections are the ones that
  // must survive a conflict with anything above them.
  parts.push(...outlineGenreFraming(input.genre));
  parts.push(
    nonFiction
      ? "Create a detailed chapter-by-chapter plan for this account following your response format. Each chapter is a unit of meaning, not a plot beat."
      : "Create a detailed chapter-by-chapter outline following your response format.",
  );
  return parts.join("\n\n");
}
