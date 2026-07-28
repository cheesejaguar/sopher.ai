// Ported from .claude/skills/outlining/SKILL.md.
// Pure data + string builders; no runtime dependencies.

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

export interface OutlinePromptInput {
  /** The expanded book concept (output of the concept phase). */
  concept: string;
  /** The author's original brief, for grounding intent. */
  brief?: string;
  /** Genre to shape structure and expectations. */
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
  const parts: string[] = [`## Book Concept\n\n${input.concept}`];
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
  parts.push("Create a detailed chapter-by-chapter outline following your response format.");
  return parts.join("\n\n");
}
