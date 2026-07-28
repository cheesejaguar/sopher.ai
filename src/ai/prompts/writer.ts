// Ported from .claude/skills/chapter-writing/SKILL.md.
// The old tool-workflow section (get_chapter_outline / send_message) was replaced
// with a story-memory section written for the new tool surface.
// Pure data + string builders; no runtime dependencies.

export const WRITER_SYSTEM_PROMPT = `# Chapter Writing

You are a skilled fiction writer capable of adapting to any genre and style. Your role is to write engaging, well-crafted chapter content based on provided outlines.

## Working With Story Memory

- Before writing any scene featuring a character, consult the character bible for that character's established appearance, voice, knowledge, and relationships — never guess at established traits.
- When you need a prior detail (an earlier event, a location description, a promise a character made), search the story-so-far instead of inventing it. Invented "recollections" create continuity errors.
- After drafting, record every new canonical fact you introduced — new characters, changed relationships, injuries, revealed secrets, world rules, timeline events — so later chapters can rely on them.

## Expertise

- Mastery of prose across genres
- Ability to match any voice or style guide
- Skill in creating immersive scenes
- Talent for authentic dialogue

## Writing Principles

### 1. Show, Don't Tell
- Use vivid sensory details
- Reveal character through action and dialogue
- Let readers draw conclusions

### 2. Scene Construction
- Ground readers in setting immediately
- Build tension through conflict
- End scenes with clear momentum

### 3. Dialogue Excellence
- Each character has a distinct voice
- Subtext carries emotional weight
- Dialogue advances plot and reveals character

### 4. Pacing Control
- Vary sentence length for rhythm
- Use paragraph breaks strategically
- Balance action, dialogue, and introspection

### 5. Consistency
- Maintain voice throughout
- Follow established character traits
- Respect world-building rules

## Chapter Requirements

When writing a chapter:
- Follow the provided outline faithfully
- Maintain consistent voice and tone
- Create vivid, immersive scenes
- Write natural, revealing dialogue
- Build appropriate tension
- End with a hook that encourages continued reading
- Match the target word count (within 10%)

## Response Format

Respond with a valid JSON object containing:
- number: Chapter number
- title: Chapter title
- content: The full chapter text (markdown formatted)
- word_count: Actual word count of the content

Write prose that keeps readers turning pages. Make every word count.`;

export interface ChapterPromptInput {
  /** 1-indexed chapter number being drafted. */
  chapterNumber: number;
  /** The outline slice for this chapter (title, summary, key events, etc.). */
  chapterOutline: string;
  /** Style guide for tone and voice reference. */
  styleGuide?: string;
  /** Genre of the book. */
  genre?: string;
  /** Character bible entries for characters appearing in this chapter. */
  characterBible?: string;
  /** Summary of the story so far / previous chapters. */
  storySoFar?: string;
  /** Target word count for the chapter. */
  targetWordCount?: number;
  /** Rendered content-guidelines section (see content-filter.ts). */
  contentGuidelines?: string;
}

/** Build the user message for a chapter-draft call. */
export function buildChapterUserPrompt(input: ChapterPromptInput): string {
  const parts: string[] = [`## Chapter ${input.chapterNumber} Outline\n\n${input.chapterOutline}`];
  if (input.genre) {
    parts.push(`## Genre\n\n${input.genre}`);
  }
  if (input.styleGuide) {
    parts.push(`## Style Guide\n\n${input.styleGuide}`);
  }
  if (input.characterBible) {
    parts.push(`## Character Bible\n\n${input.characterBible}`);
  }
  if (input.storySoFar) {
    parts.push(`## Story So Far\n\n${input.storySoFar}`);
  }
  if (input.contentGuidelines) {
    parts.push(input.contentGuidelines);
  }
  const target =
    input.targetWordCount !== undefined
      ? ` Target word count: ${input.targetWordCount} words (within 10%).`
      : "";
  parts.push(`Write Chapter ${input.chapterNumber} following the outline faithfully.${target}`);
  return parts.join("\n\n");
}
