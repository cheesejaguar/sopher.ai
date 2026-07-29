import { z } from "zod";
import { ENTITY_KINDS } from "./entities";

/**
 * Content-safety verdict that rides the concept and summarizer calls. The
 * product writes explicit fiction on request, so this is scoped strictly to
 * provider-AUP / illegal categories — never heat level.
 */
export const moderationVerdictSchema = z.object({
  flagged: z.boolean().default(false),
  category: z
    .enum(["minors", "nonconsent", "real_person", "hate_incitement", "self_harm", "other"])
    .optional(),
  excerpt: z.string().max(500).optional(),
  reason: z.string().max(300).optional(),
});
export type ModerationVerdict = z.infer<typeof moderationVerdictSchema>;

export const conceptSchema = z.object({
  title: z.string(),
  logline: z.string(),
  synopsis: z.string(),
  themes: z.array(z.string()).max(6),
  setting: z.string(),
  centralConflict: z.string(),
  uniqueElements: z.array(z.string()).max(5),
  characters: z
    .array(
      z.object({
        name: z.string(),
        role: z.string(),
        description: z.string(),
        arc: z.string(),
      }),
    )
    .max(10),
  moderation: moderationVerdictSchema.default({ flagged: false }),
});
export type BookConcept = z.infer<typeof conceptSchema>;

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

export const critiqueSchema = z.object({
  verdict: z.enum(["pass", "revise"]),
  score: z.number().min(0).max(1),
  issues: z
    .array(
      z.object({
        spanQuote: z.string(),
        problem: z.string(),
        fix: z.string(),
        severity: z.enum(["minor", "major"]),
      }),
    )
    .max(8),
});
export type Critique = z.infer<typeof critiqueSchema>;

export const revisionSchema = z.object({
  replacements: z
    .array(
      z.object({
        original: z.string(),
        revised: z.string(),
      }),
    )
    .max(12),
});
export type Revision = z.infer<typeof revisionSchema>;

export const chapterSummarySchema = z.object({
  summary: z.string().max(2_000),
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
        facts: z.array(z.string()).max(8),
      }),
    )
    .max(16),
  relationships: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.string(),
      }),
    )
    .max(10)
    .default([]),
  timelineNote: z.string().optional(),
  moderation: moderationVerdictSchema.default({ flagged: false }),
});
export type ChapterSummary = z.infer<typeof chapterSummarySchema>;

export const reviewPhaseResultSchema = z.object({
  score: z.number().min(0).max(1),
  summary: z.string(),
  strengths: z.array(z.string()).max(6),
  issues: z
    .array(
      z.object({
        chapters: z.array(z.number().int()).max(10),
        category: z.enum(["character", "timeline", "setting", "plot", "factual"]),
        severity: z.enum(["critical", "major", "minor"]),
        description: z.string(),
        suggestedFix: z.string(),
      }),
    )
    .max(10),
});
export type ReviewPhaseResult = z.infer<typeof reviewPhaseResultSchema>;

export const editSuggestionListSchema = z.object({
  suggestions: z
    .array(
      z.object({
        anchorText: z.string().min(8),
        replacement: z.string(),
        rationale: z.string(),
        category: z.enum(["line", "structure", "continuity", "style"]),
        severity: z.enum(["info", "warning", "error"]),
      }),
    )
    .max(20),
});
export type EditSuggestionList = z.infer<typeof editSuggestionListSchema>;

export const selectionEditSchema = z.object({
  replacement: z.string(),
  rationale: z.string(),
});
export type SelectionEdit = z.infer<typeof selectionEditSchema>;
