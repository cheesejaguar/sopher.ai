// Ported from _port/backend/continuity.py (REVIEW_PHASES, REVIEW_PROMPTS, and the
// score -> recommendation ladder). Based on NYT Book Review guidelines and
// professional literary standards. Reviewer prompt text is preserved verbatim.
// Pure data + functions; no runtime dependencies.
//
// The per-phase JSON templates the port shipped (specific_issues, notable_passages,
// timeline_valid, ...) were deleted: the phase call also carries a structured-output
// schema, and a request that states two different result shapes teaches the model to
// answer in the one the schema then rejects. REVIEW_PHASE_OUTPUT_CONTRACT is now the
// single description of the result, and it must stay in step with
// reviewPhaseResultSchema — the permissive wire schema no longer carries the enums
// and caps to the provider, so the prompt is where the model learns them.

export type ReviewPhaseKey =
  | "narrative_structure"
  | "character_development"
  | "writing_quality"
  | "thematic_elements"
  | "technical_consistency"
  | "reader_experience";

export interface ReviewPhase {
  key: ReviewPhaseKey;
  /** Human-readable phase name (shown in progress UI). */
  name: string;
  /** Short description of what the phase evaluates (shown in progress UI). */
  description: string;
  /** Weight of this phase in the overall score. All weights sum to 1.0. */
  weight: number;
  /** The reviewer system prompt for this phase (role + numbered checklist). */
  prompt: string;
}

/**
 * The one result contract every review phase is held to.
 *
 * Anthropic's structured-output path drops numeric and length bounds from the
 * schema it shows the model, and the wire schema deliberately widens the enums
 * so a near-miss answer still parses. Both caps and enums therefore have to be
 * stated here, in the prose the model actually reads.
 */
export const REVIEW_PHASE_OUTPUT_CONTRACT = `## Result format

Return one structured result with exactly these fields:
- score: a decimal between 0.0 and 1.0, where 1.0 is flawless (0.85, never 85)
- summary: 2-3 sentence overall assessment
- strengths: at most 6 short phrases
- issues: at most 10 entries, strongest findings first, each with
  - chapters: at most 10 chapter numbers, written as numbers (3, not "3")
  - category: exactly one of character, timeline, setting, plot, factual
  - severity: exactly one of critical, major, minor
  - description: what is wrong
  - suggestedFix: how to fix it

Anything past those limits is discarded unread, so spend the room on the
findings that matter most. If a finding does not fit a category or severity
above, pick the closest one rather than inventing a new word.`;

export const REVIEW_PHASES: readonly ReviewPhase[] = [
  {
    key: "narrative_structure",
    name: "Narrative & Structure",
    description: "Evaluating plot coherence, chapter progression, and story pacing",
    weight: 0.2,
    prompt: `You are a professional literary reviewer evaluating narrative structure.

Analyze this manuscript for:
1. **Plot Coherence**: Does the story have a clear beginning, middle, and end? Are there logical cause-and-effect relationships between events?
2. **Chapter Progression**: Do chapters flow naturally into each other? Is there appropriate rising action and tension?
3. **Pacing**: Is the story well-paced? Are there sections that drag or feel rushed?
4. **Scene Construction**: Are scenes properly established with clear settings, transitions, and resolutions?
5. **Story Arc**: Does the overall narrative arc feel complete and satisfying?`,
  },
  {
    key: "character_development",
    name: "Character Development",
    description: "Analyzing character consistency, motivations, arcs, and distinct voices",
    weight: 0.2,
    prompt: `You are a professional literary reviewer evaluating character development.

Analyze this manuscript for:
1. **Character Consistency**: Do characters behave consistently with their established traits throughout?
2. **Motivations**: Are character motivations clear and believable?
3. **Character Arcs**: Do main characters show growth or change over the course of the story?
4. **Distinct Voices**: Does each character have a unique voice in dialogue and internal thoughts?
5. **Relationships**: Are relationships between characters believable and well-developed?
6. **Supporting Characters**: Do secondary characters feel three-dimensional or like cardboard cutouts?`,
  },
  {
    key: "writing_quality",
    name: "Writing Quality",
    description: "Assessing prose style, clarity, dialogue effectiveness, and show vs tell",
    weight: 0.2,
    prompt: `You are a professional literary reviewer evaluating writing quality.

Analyze this manuscript for:
1. **Prose Style**: Is the writing clear, engaging, and appropriate for the genre?
2. **Show vs Tell**: Does the author effectively show emotions and events rather than just telling?
3. **Dialogue**: Is dialogue natural, purposeful, and distinct for each character?
4. **Description**: Are descriptions vivid without being purple prose?
5. **Word Choice**: Is vocabulary appropriate and varied?
6. **Sentence Structure**: Is there good variety in sentence length and structure?
7. **Grammar & Mechanics**: Are there noticeable grammatical issues?`,
  },
  {
    key: "thematic_elements",
    name: "Thematic Elements",
    description: "Examining central themes, their development, and message clarity",
    weight: 0.15,
    prompt: `You are a professional literary reviewer evaluating thematic elements.

Analyze this manuscript for:
1. **Central Themes**: What are the main themes? Are they clearly conveyed?
2. **Theme Development**: How well are themes woven throughout the narrative?
3. **Message Clarity**: Is there a clear message or takeaway without being heavy-handed?
4. **Symbolic Elements**: Are symbols and motifs used effectively?
5. **Emotional Resonance**: Do the themes create emotional impact?`,
  },
  {
    key: "technical_consistency",
    name: "Technical Consistency",
    description: "Checking timeline coherence, world-building logic, and factual accuracy",
    weight: 0.15,
    prompt: `You are a professional literary reviewer evaluating technical consistency.

Analyze this manuscript for:
1. **Timeline Coherence**: Do events happen in logical chronological order? Are there timeline errors?
2. **World-Building Logic**: Are the rules of the story world consistent?
3. **Factual Accuracy**: Are any factual claims accurate (historical, scientific, etc.)?
4. **Continuity Errors**: Are there contradictions in descriptions, events, or character knowledge?
5. **Setting Consistency**: Do locations and environments remain consistent?`,
  },
  {
    key: "reader_experience",
    name: "Reader Experience",
    description: "Evaluating engagement, emotional resonance, and overall impact",
    weight: 0.1,
    prompt: `You are a professional literary reviewer evaluating reader experience.

Analyze this manuscript for:
1. **Engagement**: Does the story hook the reader and maintain interest?
2. **Emotional Impact**: Does the story evoke appropriate emotional responses?
3. **Satisfaction**: Is the ending satisfying? Are plot threads resolved?
4. **Target Audience Fit**: Is the content appropriate for its intended audience?
5. **Readability**: Is the book easy to follow and enjoyable to read?
6. **Recommendation**: Would you recommend this book? To whom?`,
  },
];

/** Lookup map from phase key to phase. */
export const REVIEW_PHASES_BY_KEY: Record<ReviewPhaseKey, ReviewPhase> = Object.fromEntries(
  REVIEW_PHASES.map((phase) => [phase.key, phase]),
) as Record<ReviewPhaseKey, ReviewPhase>;

/**
 * Rubric phases selected for a generation tier.
 *
 * Keep this selector with the pure rubric data so sandboxed workflow
 * orchestration does not need to import the AI-, database-, and Node-backed
 * continuity agent module just to choose phase keys.
 */
export function continuityPhaseKeys(tier: "draft" | "standard" | "premium"): ReviewPhaseKey[] {
  return tier === "draft" ? ["technical_consistency"] : REVIEW_PHASES.map((phase) => phase.key);
}

/**
 * Full prompt for a review phase — the reviewer checklist followed by the one
 * result contract. Callers must not restate or override the contract.
 */
export function buildReviewPhasePrompt(key: ReviewPhaseKey): string {
  const phase = REVIEW_PHASES_BY_KEY[key];
  return `${phase.prompt}

${REVIEW_PHASE_OUTPUT_CONTRACT}`;
}

/** User message that accompanies each review phase call. */
export function buildReviewUserPrompt(manuscriptText: string): string {
  return `Please review this manuscript:\n\n${manuscriptText}`;
}

/**
 * Overall recommendation from a weighted overall score (0..1).
 * Thresholds: 0.85 / 0.70 / 0.55.
 */
export function scoreToRecommendation(score: number): string {
  if (score >= 0.85) {
    return "This manuscript is publication-ready with minor polish needed.";
  }
  if (score >= 0.7) {
    return "This manuscript shows strong potential and would benefit from targeted revisions.";
  }
  if (score >= 0.55) {
    return "This manuscript needs significant revision in several areas before publication.";
  }
  return "This manuscript requires substantial rework across multiple dimensions.";
}
