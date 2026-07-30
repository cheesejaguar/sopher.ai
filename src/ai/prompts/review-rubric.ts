// Ported from _port/backend/continuity.py (REVIEW_PHASES, REVIEW_PROMPTS, and the
// score -> recommendation ladder). Based on NYT Book Review guidelines and
// professional literary standards. Prompt text is preserved verbatim.
// Pure data + functions; no runtime dependencies.

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
  /** The JSON output template the reviewer must follow. */
  outputSchemaDescription: string;
}

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
    outputSchemaDescription: `{
    "score": <0.0-1.0>,
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "specific_issues": [
        {"chapter": <number>, "issue": "description", "suggestion": "how to fix"}
    ],
    "summary": "2-3 sentence overall assessment"
}`,
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
    outputSchemaDescription: `{
    "score": <0.0-1.0>,
    "characters_analyzed": ["name1", "name2", ...],
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "specific_issues": [
        {"character": "name", "chapter": <number>, "issue": "description", "suggestion": "how to fix"}
    ],
    "summary": "2-3 sentence overall assessment"
}`,
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
    outputSchemaDescription: `{
    "score": <0.0-1.0>,
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "notable_passages": [
        {"chapter": <number>, "type": "strength|weakness", "excerpt": "brief quote", "comment": "why notable"}
    ],
    "summary": "2-3 sentence overall assessment"
}`,
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
    outputSchemaDescription: `{
    "score": <0.0-1.0>,
    "identified_themes": ["theme1", "theme2", ...],
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "thematic_moments": [
        {"chapter": <number>, "theme": "which theme", "effectiveness": "how well handled"}
    ],
    "summary": "2-3 sentence overall assessment"
}`,
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
    outputSchemaDescription: `{
    "score": <0.0-1.0>,
    "timeline_valid": true|false,
    "continuity_errors": [
        {"chapters": [<number>, <number>], "error": "description", "fix": "suggested correction"}
    ],
    "world_building_issues": [
        {"chapter": <number>, "issue": "description", "impact": "low|medium|high"}
    ],
    "factual_concerns": [
        {"chapter": <number>, "claim": "what was stated", "concern": "why problematic"}
    ],
    "summary": "2-3 sentence overall assessment"
}`,
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
    outputSchemaDescription: `{
    "score": <0.0-1.0>,
    "engagement_level": "low|medium|high",
    "emotional_moments": [
        {"chapter": <number>, "moment": "description", "emotion": "what it evokes"}
    ],
    "strengths": ["strength1", "strength2", ...],
    "weaknesses": ["weakness1", "weakness2", ...],
    "target_audience": "description of ideal reader",
    "recommendation": "overall recommendation with reasoning",
    "summary": "2-3 sentence overall assessment"
}`,
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
 * Full system prompt for a review phase — the reviewer prompt followed by the
 * JSON output instruction, exactly as the original REVIEW_PROMPTS entries.
 */
export function buildReviewPhasePrompt(key: ReviewPhaseKey): string {
  const phase = REVIEW_PHASES_BY_KEY[key];
  return `${phase.prompt}

Provide your analysis in JSON format:
${phase.outputSchemaDescription}`;
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
