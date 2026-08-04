import { z } from "zod";
import { ENTITY_KINDS } from "./entities";
import {
  asRecord,
  coerceArray,
  coerceBoolean,
  coerceIntArray,
  coerceNonEmptyString,
  coerceNumber,
  coerceString,
  coerceStringArray,
  compact,
  oneOfOr,
  rescaleUnitScore,
  truncateArray,
  truncateString,
} from "./normalize";

/**
 * ## Strict schemas, wire schemas, normalizers
 *
 * Every schema below is the strict domain type the app consumes. Several of
 * them are also handed to `Output.object` — and Anthropic's structured-output
 * path strips every numeric and length bound (`.min` / `.max` / `.length`)
 * from the JSON schema before the model sees it. The model cannot obey a cap
 * it was never shown, so re-validation is the only enforcement, and failing
 * there is deterministic: the same request returns the same
 * reasonable-but-unbounded answer, so a retry only bills the author again.
 * That is what discarded a finished book on 2026-08-04.
 *
 * So the fragile calls send a `…WireSchema` instead and pass the answer
 * through the matching `normalize…` to land back on the strict type. Wire
 * schemas carry no bounds, no enums for model-chosen labels, and every field
 * is optional and nullable — JSON-schema validation is all-or-nothing, so one
 * missing field would otherwise throw away an entire review that the
 * normalizer could have salvaged entry by entry. The caps live in
 * `.describe()` text instead, which does survive into the provider's schema.
 *
 * Normalizers take `unknown` on purpose: a provider that ignores the wire
 * schema outright must still not be able to throw here.
 */
const wireText = z.string().nullish();
const wireNumber = z.union([z.number(), z.string()]).nullish();
const wireTextArray = z.array(wireText).nullish();

/** Neither praise nor alarm — what an unreadable score is worth. */
const UNSCORED = 0.5;

const MODERATION_CATEGORIES = [
  "minors",
  "nonconsent",
  "real_person",
  "hate_incitement",
  "self_harm",
  "other",
] as const;
const MAX_MODERATION_EXCERPT_CHARS = 500;
const MAX_MODERATION_REASON_CHARS = 300;

/**
 * Content-safety verdict that rides the concept and summarizer calls. The
 * product writes explicit fiction on request, so this is scoped strictly to
 * provider-AUP / illegal categories — never heat level.
 */
export const moderationVerdictSchema = z.object({
  flagged: z.boolean().default(false),
  category: z.enum(MODERATION_CATEGORIES).optional(),
  excerpt: z.string().max(MAX_MODERATION_EXCERPT_CHARS).optional(),
  reason: z.string().max(MAX_MODERATION_REASON_CHARS).optional(),
});
export type ModerationVerdict = z.infer<typeof moderationVerdictSchema>;

export const moderationVerdictWireSchema = z.object({
  flagged: z.union([z.boolean(), z.string()]).nullish(),
  category: wireText.describe(`One of: ${MODERATION_CATEGORIES.join(", ")}`),
  excerpt: wireText.describe("The short passage that triggered the flag"),
  reason: wireText,
});
export type ModerationVerdictWire = z.infer<typeof moderationVerdictWireSchema>;

export function normalizeModerationVerdict(wire: unknown): ModerationVerdict {
  const value = asRecord(wire);
  const rawCategory = coerceNonEmptyString(value.category);
  // An unrecognized category still means the model saw something, so it lands
  // on "other" rather than being dropped — but a non-string never invents one.
  const category = rawCategory ? oneOfOr(rawCategory, MODERATION_CATEGORIES, "other") : null;
  const excerpt = coerceNonEmptyString(value.excerpt);
  const reason = coerceNonEmptyString(value.reason);
  return {
    flagged: coerceBoolean(value.flagged),
    ...(category ? { category } : {}),
    ...(excerpt ? { excerpt: truncateString(excerpt, MAX_MODERATION_EXCERPT_CHARS) } : {}),
    ...(reason ? { reason: truncateString(reason, MAX_MODERATION_REASON_CHARS) } : {}),
  };
}

const MAX_CONCEPT_THEMES = 6;
const MAX_CONCEPT_UNIQUE_ELEMENTS = 5;
const MAX_CONCEPT_CHARACTERS = 10;

export const conceptSchema = z.object({
  title: z.string(),
  logline: z.string(),
  synopsis: z.string(),
  themes: z.array(z.string()).max(MAX_CONCEPT_THEMES),
  setting: z.string(),
  centralConflict: z.string(),
  uniqueElements: z.array(z.string()).max(MAX_CONCEPT_UNIQUE_ELEMENTS),
  characters: z
    .array(
      z.object({
        name: z.string(),
        role: z.string(),
        description: z.string(),
        arc: z.string(),
      }),
    )
    .max(MAX_CONCEPT_CHARACTERS),
  moderation: moderationVerdictSchema.default({ flagged: false }),
});
export type BookConcept = z.infer<typeof conceptSchema>;

export const conceptWireSchema = z.object({
  title: wireText,
  logline: wireText,
  synopsis: wireText,
  themes: wireTextArray.describe(`At most ${MAX_CONCEPT_THEMES} themes`),
  setting: wireText,
  centralConflict: wireText,
  uniqueElements: wireTextArray.describe(`At most ${MAX_CONCEPT_UNIQUE_ELEMENTS} elements`),
  characters: z
    .array(
      z.object({
        name: wireText,
        role: wireText,
        description: wireText,
        arc: wireText,
      }),
    )
    .nullish()
    .describe(`At most ${MAX_CONCEPT_CHARACTERS} characters, most important first`),
  moderation: moderationVerdictWireSchema.nullish(),
});
export type BookConceptWire = z.infer<typeof conceptWireSchema>;

function normalizeConceptCharacter(wire: unknown): BookConcept["characters"][number] | null {
  const character = asRecord(wire);
  const name = coerceNonEmptyString(character.name);
  // A nameless character cannot be referenced by any later phase.
  if (!name) return null;
  return {
    name,
    role: coerceString(character.role),
    description: coerceString(character.description),
    arc: coerceString(character.arc),
  };
}

export function normalizeConcept(wire: unknown): BookConcept {
  const value = asRecord(wire);
  return {
    title: coerceString(value.title),
    logline: coerceString(value.logline),
    synopsis: coerceString(value.synopsis),
    themes: truncateArray(coerceStringArray(value.themes), MAX_CONCEPT_THEMES),
    setting: coerceString(value.setting),
    centralConflict: coerceString(value.centralConflict),
    uniqueElements: truncateArray(
      coerceStringArray(value.uniqueElements),
      MAX_CONCEPT_UNIQUE_ELEMENTS,
    ),
    characters: truncateArray(
      compact(coerceArray(value.characters).map(normalizeConceptCharacter)),
      MAX_CONCEPT_CHARACTERS,
    ),
    moderation: normalizeModerationVerdict(value.moderation),
  };
}

const CREATIVE_OPTION_IDS = ["option-1", "option-2", "option-3"] as const;
const MIN_CREATIVE_QUESTION_CHARS = 12;
const MAX_CREATIVE_QUESTION_CHARS = 240;
const MIN_CREATIVE_RATIONALE_CHARS = 8;
const MAX_CREATIVE_RATIONALE_CHARS = 320;
const MAX_CREATIVE_LABEL_CHARS = 80;
const MAX_CREATIVE_DESCRIPTION_CHARS = 280;
/**
 * Says nothing the model did not say. Mirrors the neutral line
 * `src/lib/creative-decisions.ts` already shows for rows with no rationale,
 * so an unusable rationale costs the author a garnish, not the question.
 */
const CREATIVE_RATIONALE_FALLBACK = "Choose the direction that feels most like your story.";

export const creativeQuestionOptionSchema = z.object({
  id: z.enum(CREATIVE_OPTION_IDS),
  label: z.string().trim().min(2).max(MAX_CREATIVE_LABEL_CHARS),
  description: z.string().trim().min(8).max(MAX_CREATIVE_DESCRIPTION_CHARS),
});

export const creativeQuestionSchema = z
  .object({
    question: z.string().trim().min(MIN_CREATIVE_QUESTION_CHARS).max(MAX_CREATIVE_QUESTION_CHARS),
    rationale: z
      .string()
      .trim()
      .min(MIN_CREATIVE_RATIONALE_CHARS)
      .max(MAX_CREATIVE_RATIONALE_CHARS),
    options: z.array(creativeQuestionOptionSchema).length(3),
    recommendedOptionId: z.enum(CREATIVE_OPTION_IDS),
  })
  .superRefine((question, ctx) => {
    const ids = question.options.map((option) => option.id);
    if (new Set(ids).size !== 3) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Creative direction options must use three distinct ids",
      });
    }
    if (!ids.includes(question.recommendedOptionId)) {
      ctx.addIssue({
        code: "custom",
        path: ["recommendedOptionId"],
        message: "The recommended option must be one of the three choices",
      });
    }
  });
export type CreativeQuestion = z.infer<typeof creativeQuestionSchema>;

export const creativeQuestionWireSchema = z.object({
  question: wireText.describe("One question for the author, at most 240 characters"),
  rationale: wireText.describe("Why this choice matters, at most 320 characters"),
  options: z
    .array(
      z.object({
        id: wireText.describe("option-1, option-2 or option-3, in order"),
        label: wireText.describe("At most 80 characters"),
        description: wireText.describe("At most 280 characters"),
      }),
    )
    .nullish()
    .describe("Exactly three distinct options"),
  recommendedOptionId: wireText.describe("The id of the option you recommend"),
});
export type CreativeQuestionWire = z.infer<typeof creativeQuestionWireSchema>;

type CreativeOptionDraft = {
  /** The model's own id, kept only long enough to resolve the recommendation. */
  id: string | null;
  label: string;
  description: string;
};

function normalizeCreativeOption(wire: unknown): CreativeOptionDraft | null {
  const option = asRecord(wire);
  const label = coerceNonEmptyString(option.label);
  const description = coerceNonEmptyString(option.description);
  // An option the author cannot read is not a choice; the strict schema's
  // floors are the arbiter, so short entries drop instead of being padded.
  if (!label || !description) return null;
  return {
    id: coerceNonEmptyString(option.id),
    label: truncateString(label, MAX_CREATIVE_LABEL_CHARS),
    description: truncateString(description, MAX_CREATIVE_DESCRIPTION_CHARS),
  };
}

/**
 * Returns null when the answer cannot be made into a real choice — fewer than
 * three usable options, or no question worth asking. Callers should skip the
 * optional creative-direction beat rather than retry: the model will answer
 * the same way again.
 */
export function normalizeCreativeQuestion(wire: unknown): CreativeQuestion | null {
  const value = asRecord(wire);
  const options = truncateArray(
    compact(coerceArray(value.options).map(normalizeCreativeOption)),
    3,
  );
  // Options are positional, so the model's ids are used only to find the one
  // it recommended and are then reassigned. That repairs duplicate or invented
  // ids without silently moving the recommendation to a different option.
  const recommended = coerceNonEmptyString(value.recommendedOptionId)?.toLowerCase();
  const recommendedIndex = options.findIndex((option) => option.id?.toLowerCase() === recommended);
  const rationale = coerceNonEmptyString(value.rationale);
  const parsed = creativeQuestionSchema.safeParse({
    question: truncateString(coerceString(value.question), MAX_CREATIVE_QUESTION_CHARS),
    rationale: truncateString(
      rationale && rationale.length >= MIN_CREATIVE_RATIONALE_CHARS
        ? rationale
        : CREATIVE_RATIONALE_FALLBACK,
      MAX_CREATIVE_RATIONALE_CHARS,
    ),
    options: options.map((option, index) => ({
      id: CREATIVE_OPTION_IDS[index],
      label: option.label,
      description: option.description,
    })),
    recommendedOptionId: CREATIVE_OPTION_IDS[recommendedIndex >= 0 ? recommendedIndex : 0],
  });
  return parsed.success ? parsed.data : null;
}

export const emotionalArcSchema = z.enum([
  "exposition",
  "rising_action",
  "tension_building",
  "climax",
  "falling_action",
  "resolution",
  "denouement",
  "transition",
]);

export const chapterOutlineSchema = z.object({
  number: z.number().int().min(1),
  title: z.string(),
  summary: z.string(),
  keyEvents: z.array(z.string()).max(8),
  charactersPresent: z.array(z.string()).max(10),
  emotionalArc: emotionalArcSchema,
  openingHook: z.string(),
  closingHook: z.string(),
  targetWords: z.number().int().min(500).max(10_000),
});
export type ChapterOutlinePlan = z.infer<typeof chapterOutlineSchema>;

export const bookOutlineSchema = z.object({
  title: z.string(),
  logline: z.string(),
  synopsis: z.string(),
  themes: z.array(z.string()).max(6),
  plotStructure: z.string(),
  chapters: z.array(chapterOutlineSchema).min(3).max(60),
});
export type BookOutline = z.infer<typeof bookOutlineSchema>;

export const scenePlanSchema = z.object({
  scenes: z
    .array(
      z.object({
        beat: z.string(),
        povGoal: z.string(),
        conflict: z.string(),
        exitState: z.string(),
        charactersNeeded: z.array(z.string()).max(8),
      }),
    )
    .min(1)
    .max(6),
  openingHookApproach: z.string(),
  closingHookApproach: z.string(),
});
export type ScenePlan = z.infer<typeof scenePlanSchema>;

const CRITIQUE_VERDICTS = ["pass", "revise"] as const;
const CRITIQUE_SEVERITIES = ["minor", "major"] as const;
const MAX_CRITIQUE_ISSUES = 8;

export const critiqueSchema = z.object({
  verdict: z.enum(CRITIQUE_VERDICTS),
  score: z.number().min(0).max(1),
  issues: z
    .array(
      z.object({
        spanQuote: z.string(),
        problem: z.string(),
        fix: z.string(),
        severity: z.enum(CRITIQUE_SEVERITIES),
      }),
    )
    .max(MAX_CRITIQUE_ISSUES),
});
export type Critique = z.infer<typeof critiqueSchema>;

export const critiqueWireSchema = z.object({
  verdict: wireText.describe(`One of: ${CRITIQUE_VERDICTS.join(", ")}`),
  score: wireNumber.describe("Chapter quality from 0 to 1, e.g. 0.82"),
  issues: z
    .array(
      z.object({
        spanQuote: wireText.describe("The passage at fault, quoted verbatim"),
        problem: wireText,
        fix: wireText,
        severity: wireText.describe(`One of: ${CRITIQUE_SEVERITIES.join(", ")}`),
      }),
    )
    .nullish()
    .describe(`At most ${MAX_CRITIQUE_ISSUES} issues, most serious first`),
});
export type CritiqueWire = z.infer<typeof critiqueWireSchema>;

function normalizeCritiqueIssue(wire: unknown): Critique["issues"][number] | null {
  const issue = asRecord(wire);
  const problem = coerceNonEmptyString(issue.problem);
  // Nothing downstream can act on an issue that never names the problem.
  if (!problem) return null;
  return {
    spanQuote: coerceString(issue.spanQuote),
    problem,
    fix: coerceString(issue.fix),
    severity: oneOfOr(issue.severity, CRITIQUE_SEVERITIES, "minor"),
  };
}

export function normalizeCritique(wire: unknown): Critique {
  const value = asRecord(wire);
  const score = coerceNumber(value.score);
  return {
    // The writer only revises when an issue is "major", so an unreadable
    // verdict defers to the issue list instead of forcing a paid revision.
    verdict: oneOfOr(value.verdict, CRITIQUE_VERDICTS, "revise"),
    score: score === null ? UNSCORED : rescaleUnitScore(score),
    issues: truncateArray(
      compact(coerceArray(value.issues).map(normalizeCritiqueIssue)),
      MAX_CRITIQUE_ISSUES,
    ),
  };
}

const MAX_REVISION_REPLACEMENTS = 12;

export const revisionSchema = z.object({
  replacements: z
    .array(
      z.object({
        original: z.string(),
        revised: z.string(),
      }),
    )
    .max(MAX_REVISION_REPLACEMENTS),
});
export type Revision = z.infer<typeof revisionSchema>;

export const revisionWireSchema = z.object({
  replacements: z
    .array(
      z.object({
        original: wireText.describe("The passage to replace, quoted verbatim"),
        revised: wireText.describe("What it becomes"),
      }),
    )
    .nullish()
    .describe(`At most ${MAX_REVISION_REPLACEMENTS} replacements`),
});
export type RevisionWire = z.infer<typeof revisionWireSchema>;

function normalizeReplacement(wire: unknown): Revision["replacements"][number] | null {
  const replacement = asRecord(wire);
  const original = coerceNonEmptyString(replacement.original);
  // No anchor means nothing to replace; and a *missing* revision must never be
  // defaulted to "", which would silently delete the anchored prose. An
  // explicit empty string still means "cut this", so only the type is checked.
  if (!original || typeof replacement.revised !== "string") return null;
  return { original, revised: replacement.revised };
}

export function normalizeRevision(wire: unknown): Revision {
  const value = asRecord(wire);
  return {
    replacements: truncateArray(
      compact(coerceArray(value.replacements).map(normalizeReplacement)),
      MAX_REVISION_REPLACEMENTS,
    ),
  };
}

const MAX_CHAPTER_SUMMARY_CHARS = 2_000;
const MAX_ENTITY_FACTS = 8;
const MAX_NEW_FACTS = 16;
const MAX_RELATIONSHIPS = 10;
const MAX_RELATIONSHIP_DESCRIPTION_CHARS = 300;

export const chapterSummarySchema = z.object({
  summary: z.string().max(MAX_CHAPTER_SUMMARY_CHARS),
  /**
   * Entity deltas ride along on the summarizer call that already runs after
   * every chapter, so per-chapter bible upkeep costs a few hundred output
   * tokens rather than a second request per chapter.
   */
  newFacts: z
    .array(
      z.object({
        kind: z.enum(ENTITY_KINDS).default("character"),
        name: z.string(),
        facts: z.array(z.string()).max(MAX_ENTITY_FACTS),
      }),
    )
    .max(MAX_NEW_FACTS),
  relationships: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.string(),
        description: z
          .string()
          .max(MAX_RELATIONSHIP_DESCRIPTION_CHARS)
          .optional()
          .describe("What the relationship means in the story"),
      }),
    )
    .max(MAX_RELATIONSHIPS)
    .default([]),
  timelineNote: z.string().optional(),
  moderation: moderationVerdictSchema.default({ flagged: false }),
});
export type ChapterSummary = z.infer<typeof chapterSummarySchema>;

export const chapterSummaryWireSchema = z.object({
  summary: wireText.describe(`At most ${MAX_CHAPTER_SUMMARY_CHARS} characters`),
  newFacts: z
    .array(
      z.object({
        kind: wireText.describe(`One of: ${ENTITY_KINDS.join(", ")}`),
        name: wireText,
        facts: wireTextArray.describe(`At most ${MAX_ENTITY_FACTS} facts for this entity`),
      }),
    )
    .nullish()
    .describe(`At most ${MAX_NEW_FACTS} entities`),
  relationships: z
    .array(
      z.object({
        from: wireText,
        to: wireText,
        type: wireText,
        description: wireText.describe("What the relationship means in the story"),
      }),
    )
    .nullish()
    .describe(`At most ${MAX_RELATIONSHIPS} relationships`),
  timelineNote: wireText,
  moderation: moderationVerdictWireSchema.nullish(),
});
export type ChapterSummaryWire = z.infer<typeof chapterSummaryWireSchema>;

function normalizeEntityDelta(wire: unknown): ChapterSummary["newFacts"][number] | null {
  const delta = asRecord(wire);
  const name = coerceNonEmptyString(delta.name);
  // The bible is keyed by name; an unnamed delta cannot be merged into it.
  if (!name) return null;
  return {
    kind: oneOfOr(delta.kind, ENTITY_KINDS, "character"),
    name,
    facts: truncateArray(coerceStringArray(delta.facts), MAX_ENTITY_FACTS),
  };
}

function normalizeRelationship(wire: unknown): ChapterSummary["relationships"][number] | null {
  const relationship = asRecord(wire);
  const from = coerceNonEmptyString(relationship.from);
  const to = coerceNonEmptyString(relationship.to);
  const type = coerceNonEmptyString(relationship.type);
  // A relationship missing either end, or what it is, links nothing.
  if (!from || !to || !type) return null;
  const description = coerceNonEmptyString(relationship.description);
  return {
    from,
    to,
    type,
    ...(description
      ? { description: truncateString(description, MAX_RELATIONSHIP_DESCRIPTION_CHARS) }
      : {}),
  };
}

export function normalizeChapterSummary(wire: unknown): ChapterSummary {
  const value = asRecord(wire);
  const timelineNote = coerceNonEmptyString(value.timelineNote);
  return {
    summary: truncateString(coerceString(value.summary), MAX_CHAPTER_SUMMARY_CHARS),
    newFacts: truncateArray(
      compact(coerceArray(value.newFacts).map(normalizeEntityDelta)),
      MAX_NEW_FACTS,
    ),
    relationships: truncateArray(
      compact(coerceArray(value.relationships).map(normalizeRelationship)),
      MAX_RELATIONSHIPS,
    ),
    ...(timelineNote ? { timelineNote } : {}),
    moderation: normalizeModerationVerdict(value.moderation),
  };
}

const REVIEW_ISSUE_CATEGORIES = ["character", "timeline", "setting", "plot", "factual"] as const;
const REVIEW_ISSUE_SEVERITIES = ["critical", "major", "minor"] as const;
const MAX_REVIEW_STRENGTHS = 6;
const MAX_REVIEW_ISSUES = 10;
const MAX_ISSUE_CHAPTERS = 10;

export const reviewPhaseResultSchema = z.object({
  score: z.number().min(0).max(1),
  summary: z.string(),
  strengths: z.array(z.string()).max(MAX_REVIEW_STRENGTHS),
  issues: z
    .array(
      z.object({
        chapters: z.array(z.number().int()).max(MAX_ISSUE_CHAPTERS),
        category: z.enum(REVIEW_ISSUE_CATEGORIES),
        severity: z.enum(REVIEW_ISSUE_SEVERITIES),
        description: z.string(),
        suggestedFix: z.string(),
      }),
    )
    .max(MAX_REVIEW_ISSUES),
});
export type ReviewPhaseResult = z.infer<typeof reviewPhaseResultSchema>;

export const reviewPhaseResultWireSchema = z.object({
  score: wireNumber.describe("Quality for this phase from 0 to 1, e.g. 0.82"),
  summary: wireText,
  strengths: wireTextArray.describe(`At most ${MAX_REVIEW_STRENGTHS} strengths`),
  issues: z
    .array(
      z.object({
        chapters: z
          .array(wireNumber)
          .nullish()
          .describe(`At most ${MAX_ISSUE_CHAPTERS} chapter numbers`),
        category: wireText.describe(`One of: ${REVIEW_ISSUE_CATEGORIES.join(", ")}`),
        severity: wireText.describe(`One of: ${REVIEW_ISSUE_SEVERITIES.join(", ")}`),
        description: wireText,
        suggestedFix: wireText,
      }),
    )
    .nullish()
    .describe(`At most ${MAX_REVIEW_ISSUES} issues, most severe first`),
});
export type ReviewPhaseResultWire = z.infer<typeof reviewPhaseResultWireSchema>;

function normalizeReviewIssue(wire: unknown): ReviewPhaseResult["issues"][number] | null {
  const issue = asRecord(wire);
  const description = coerceNonEmptyString(issue.description);
  // Defaulting the description would manufacture a finding the model never
  // made, and the author would be asked to act on an empty line.
  if (!description) return null;
  return {
    chapters: truncateArray(coerceIntArray(issue.chapters), MAX_ISSUE_CHAPTERS),
    category: oneOfOr(issue.category, REVIEW_ISSUE_CATEGORIES, "plot"),
    severity: oneOfOr(issue.severity, REVIEW_ISSUE_SEVERITIES, "minor"),
    description,
    suggestedFix: coerceString(issue.suggestedFix),
  };
}

export function normalizeReviewPhaseResult(wire: unknown): ReviewPhaseResult {
  const value = asRecord(wire);
  const score = coerceNumber(value.score);
  return {
    score: score === null ? UNSCORED : rescaleUnitScore(score),
    summary: coerceString(value.summary),
    strengths: truncateArray(coerceStringArray(value.strengths), MAX_REVIEW_STRENGTHS),
    // Unusable issues are dropped before the cap so ten *usable* findings
    // survive a response that also contained a few empty ones.
    issues: truncateArray(
      compact(coerceArray(value.issues).map(normalizeReviewIssue)),
      MAX_REVIEW_ISSUES,
    ),
  };
}

const EDIT_SUGGESTION_CATEGORIES = ["line", "structure", "continuity", "style"] as const;
const EDIT_SUGGESTION_SEVERITIES = ["info", "warning", "error"] as const;
const MIN_EDIT_ANCHOR_CHARS = 8;
const MAX_EDIT_SUGGESTIONS = 20;

export const editSuggestionListSchema = z.object({
  suggestions: z
    .array(
      z.object({
        anchorText: z.string().min(MIN_EDIT_ANCHOR_CHARS),
        replacement: z.string(),
        rationale: z.string(),
        category: z.enum(EDIT_SUGGESTION_CATEGORIES),
        severity: z.enum(EDIT_SUGGESTION_SEVERITIES),
      }),
    )
    .max(MAX_EDIT_SUGGESTIONS),
});
export type EditSuggestionList = z.infer<typeof editSuggestionListSchema>;

export const editSuggestionListWireSchema = z.object({
  suggestions: z
    .array(
      z.object({
        anchorText: wireText.describe("The passage to change, quoted verbatim"),
        replacement: wireText.describe("What it becomes"),
        rationale: wireText,
        category: wireText.describe(`One of: ${EDIT_SUGGESTION_CATEGORIES.join(", ")}`),
        severity: wireText.describe(`One of: ${EDIT_SUGGESTION_SEVERITIES.join(", ")}`),
      }),
    )
    .nullish()
    .describe(`At most ${MAX_EDIT_SUGGESTIONS} suggestions`),
});
export type EditSuggestionListWire = z.infer<typeof editSuggestionListWireSchema>;

function normalizeEditSuggestion(wire: unknown): EditSuggestionList["suggestions"][number] | null {
  const suggestion = asRecord(wire);
  const anchorText = coerceNonEmptyString(suggestion.anchorText);
  // Too short to locate in the manuscript, or no replacement text at all —
  // defaulting the latter to "" would turn a suggestion into a silent deletion.
  if (!anchorText || anchorText.length < MIN_EDIT_ANCHOR_CHARS) return null;
  if (typeof suggestion.replacement !== "string") return null;
  return {
    anchorText,
    replacement: suggestion.replacement,
    rationale: coerceString(suggestion.rationale),
    category: oneOfOr(suggestion.category, EDIT_SUGGESTION_CATEGORIES, "line"),
    severity: oneOfOr(suggestion.severity, EDIT_SUGGESTION_SEVERITIES, "info"),
  };
}

export function normalizeEditSuggestionList(wire: unknown): EditSuggestionList {
  const value = asRecord(wire);
  return {
    suggestions: truncateArray(
      compact(coerceArray(value.suggestions).map(normalizeEditSuggestion)),
      MAX_EDIT_SUGGESTIONS,
    ),
  };
}

export const selectionEditSchema = z.object({
  replacement: z.string(),
  rationale: z.string(),
});
export type SelectionEdit = z.infer<typeof selectionEditSchema>;
