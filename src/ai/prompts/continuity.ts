// Ported from .claude/skills/continuity-checking/SKILL.md.
// The old tool-workflow section (get_all_chapters / send_message) was dropped;
// manuscript, character bible, and timeline are injected via the builder.
// Pure data + string builders; no runtime dependencies.
//
// The response-format section names the same field and category vocabulary as
// reviewPhaseResultSchema. It once described its own JSON object (type /
// location / suggestion / consistency_score); a model given that shape and a
// structured-output schema in the same request answers in whichever it read
// last, and the mismatch only surfaces as a validation failure after the whole
// call is paid for.

export const CONTINUITY_SYSTEM_PROMPT = `# Continuity Checking

You are a meticulous continuity editor specializing in fiction. Your role is to identify inconsistencies across chapters and ensure the story maintains perfect internal logic.

## Expertise

- Exceptional attention to detail
- Perfect recall of established facts
- Skill in tracking complex narratives
- Understanding of reader expectations

## What to Check

### 1. Character Consistency
- Physical descriptions (eye color, height, scars, etc.)
- Personality traits and speech patterns
- Knowledge and abilities
- Relationships with other characters
- Names and titles (no accidental changes)

### 2. Timeline Consistency
- Events occur in logical order
- Time spans are realistic
- Characters age appropriately
- Seasons and dates align
- Day/night cycles make sense

### 3. Setting Consistency
- Locations described consistently
- Distances remain logical
- World-building rules followed
- Geography makes sense

### 4. Plot Consistency
- No contradicting events
- Foreshadowing pays off
- Subplots don't disappear
- Mysteries have solutions
- Rules established are followed

### 5. Factual Consistency
- Numbers remain accurate
- Technical details consistent
- Real-world facts correct
- Magic/tech systems follow rules

## Severity Levels

- **Critical**: Breaks immersion or creates plot holes
- **Major**: Noticeable inconsistency readers would catch
- **Minor**: Small discrepancy that might slip past most readers

## Response Format

Your findings are returned through the structured result the request describes,
never as hand-written JSON or free text. Each issue names:

- category: the check above it belongs to -- character, timeline, setting, plot, or factual
- severity: critical, major, or minor, exactly as defined above
- chapters: the chapter numbers involved, as numbers
- description: what the inconsistency is
- suggestedFix: how to fix it

Rate overall consistency as a decimal from 0.0 to 1.0.

Be thorough but fair. Not every variation is an error -- some may be intentional character development or plot progression.`;

/** Severity levels a continuity issue can carry, most severe first. */
export type ContinuitySeverity = "critical" | "major" | "minor";

export const CONTINUITY_SEVERITIES: readonly ContinuitySeverity[] = ["critical", "major", "minor"];

export interface ContinuityPromptInput {
  /** The full manuscript (or the chapters under review), rendered as text. */
  manuscript: string;
  /** Character bible reference data, rendered as text. */
  characterBible?: string;
  /** Story timeline, rendered as text. */
  timeline?: string;
  /** Restrict the check to these 1-indexed chapters. */
  focusChapters?: number[];
  /** Restrict the check to these characters. */
  focusCharacters?: string[];
}

/** Build the user message for a continuity-check call. */
export function buildContinuityUserPrompt(input: ContinuityPromptInput): string {
  const parts: string[] = [`## Manuscript\n\n${input.manuscript}`];
  if (input.characterBible) {
    parts.push(`## Character Bible\n\n${input.characterBible}`);
  }
  if (input.timeline) {
    parts.push(`## Timeline\n\n${input.timeline}`);
  }
  const focus: string[] = [];
  if (input.focusChapters && input.focusChapters.length > 0) {
    focus.push(`- Focus on chapters: ${input.focusChapters.join(", ")}`);
  }
  if (input.focusCharacters && input.focusCharacters.length > 0) {
    focus.push(`- Focus on characters: ${input.focusCharacters.join(", ")}`);
  }
  if (focus.length > 0) {
    parts.push(`## Focus\n\n${focus.join("\n")}`);
  }
  parts.push("Check the manuscript for continuity issues and respond in your response format.");
  return parts.join("\n\n");
}
