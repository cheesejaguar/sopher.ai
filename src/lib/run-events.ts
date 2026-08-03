import { z } from "zod";
import type {
  BookConcept,
  BookOutline,
  ChapterSummary,
  Critique,
  ReviewPhaseResult,
  ScenePlan,
} from "@/ai/schemas";
import type { EntityKind } from "@/ai/schemas/entities";
import type { ReviewPhaseKey } from "@/ai/prompts/review-rubric";

// The NDJSON contract between the generate-book workflow and the UI.
// Namespace "progress" carries these events; namespace "chapter:{n}" carries
// raw prose deltas (JSON-encoded strings) for the currently drafting chapter.

export const stageSchema = z.enum([
  "queued",
  "concept",
  "outline",
  "awaiting_approval",
  "awaiting_credits",
  "bible",
  "chapters",
  "editing",
  "continuity",
  "revising",
  "finalizing",
  "done",
  "failed",
  "cancelled",
]);
export type Stage = z.infer<typeof stageSchema>;

export const runEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stage"),
    stage: stageSchema,
    pct: z.number().min(0).max(100),
    detail: z.string().optional(),
    /** Concrete phase that will resume after an awaiting_credits pause. */
    resumeStage: z
      .enum(["concept", "outline", "bible", "chapters", "editing", "continuity", "revising"])
      .optional(),
  }),
  z.object({
    type: z.literal("chapter"),
    chapterNumber: z.number().int(),
    status: z.enum(["planned", "drafting", "drafted", "edited", "final"]),
    wordCount: z.number().int().optional(),
    qualityScore: z.number().optional(),
  }),
  z.object({
    type: z.literal("agent"),
    agent: z.enum([
      "concept",
      "outliner",
      "entity-bible",
      "writer",
      "editor",
      "continuity",
      "summarizer",
    ]),
    message: z.string(),
    chapterNumber: z.number().int().optional(),
  }),
  z.object({
    type: z.literal("cost"),
    /** Raw provider/model cost retained for operator reconciliation. */
    totalUsd: z.number(),
    /** Actual author usage debits after logical-call idempotency. */
    totalCredits: z.number().optional(),
  }),
  z.object({
    type: z.literal("review"),
    score: z.number(),
    recommendation: z.string(),
    issueCount: z.number().int(),
  }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    fatal: z.boolean(),
  }),
]);
export type RunEvent = z.infer<typeof runEventSchema>;

export const PROGRESS_NS = "progress";
export const chapterNs = (n: number) => `chapter:${n}`;

export type GenerationInputSnapshot = {
  /** Author-owned identity. Agents may refine the story, never silently rename it. */
  workingTitle?: string;
  brief: string;
  genre: string | null;
  styleGuide: string | null;
  voiceProfile: string | null;
  pov: "first" | "third_limited" | "third_omniscient" | null;
  tense: "past" | "present" | null;
  tone: string | null;
  styleProfile: string | null;
  heatLevel: "none" | "mild" | "moderate" | "explicit" | null;
  violenceLevel: "none" | "mild" | "moderate" | "graphic" | null;
  profanity: "none" | "mild" | "moderate" | "strong" | null;
  avoidTopics: string[];
};

export type GenerationPreparationState = {
  manuscriptReset?: true;
  entityCanonReset?: true;
  conceptPersisted?: true;
  outlinePersisted?: true;
};

export type RetiredEntityCanon = {
  entities: Array<{
    id: string;
    kind: EntityKind;
    name: string;
    aliases: string[];
    attrs: Record<string, unknown>;
    portraitAssetId: string | null;
    firstAppearanceChapter: number | null;
    lastUpdatedChapter: number | null;
  }>;
  relationships: Array<{
    id: string;
    fromEntityId: string;
    toEntityId: string;
    type: string;
    description: string | null;
    establishedChapter: number | null;
  }>;
};

export type StoredContinuityOutcome = {
  key: ReviewPhaseKey;
  weight: number;
  result: ReviewPhaseResult;
};

export type StoredContinuityReport = {
  score: number;
  recommendation: string;
  phases: { key: ReviewPhaseKey; score: number; summary: string }[];
  issues: ReviewPhaseResult["issues"];
  worstChapters: number[];
};

export type ChapterArtifactCheckpoint = {
  sourceRunId: string;
  contentDigest: string;
};

export type EditArtifactCheckpoint = ChapterArtifactCheckpoint & {
  changed: boolean;
  /** Review source that authorized this continuity-driven revision. */
  reviewManuscriptDigest?: string;
};

/**
 * Durable, run-owned proof that an expensive artifact was fully applied.
 *
 * These checkpoints are copied only when the retry keeps byte-equivalent
 * staged concept/outline artifacts. Content digests prevent a user's edit
 * between attempts from making a stale chapter checkpoint look reusable.
 */
export type GenerationCompletionState = {
  inheritedFromRunId?: string;
  entityBible?: {
    sourceRunId: string;
    entityCount: number;
    relationshipCount: number;
  };
  chapterSummaries?: Record<string, ChapterArtifactCheckpoint>;
  editedChapters?: Record<string, EditArtifactCheckpoint>;
  revisionChapters?: Record<string, EditArtifactCheckpoint>;
  continuityOutcomes?: Partial<
    Record<
      ReviewPhaseKey,
      {
        sourceRunId: string;
        manuscriptDigest: string;
        outcome: StoredContinuityOutcome;
      }
    >
  >;
  continuityReport?: {
    sourceRunId: string;
    manuscriptDigest: string;
    report: StoredContinuityReport;
  };
  finalized?: { sourceRunId: string; manuscriptDigest: string };
};

export type GenerationWorkState = {
  conceptExpanded?: BookConcept;
  outline?: {
    revisionNotes: string | null;
    plan?: unknown;
    draft?: BookOutline;
    final?: BookOutline;
  };
  chapters?: Record<
    string,
    {
      scenePlan?: ScenePlan;
      draft?: string;
      critique?: Critique;
      summary?: {
        contentDigest: string;
        result: ChapterSummary;
      };
      result?: {
        content: string;
        wordCount: number;
        qualityScore: number;
        critique: Critique | null;
      };
    }
  >;
  edits?: Record<
    string,
    {
      baseContentDigest: string;
      content: string;
      changed: boolean;
      notes: string[];
    }
  >;
};

export type GenerationConfig = {
  /**
   * Version 2 uses registered, versioned durable inputs. Historical and
   * deployment-pinned runs may omit this or explicitly store v1; new snapshots
   * write v2.
   */
  protocolVersion?: 1 | 2;
  /**
   * Set only after the post-insert, project-locked snapshot has been frozen.
   * An uncertain Workflow retry must never dispatch a config without this
   * durable readiness proof.
   */
  dispatchReady?: true;
  /** Absent on historical runs, which are treated as full books. */
  productionMode?: "trial_short_story" | "full_book";
  tier: "draft" | "standard" | "premium";
  requireOutlineApproval: boolean;
  waveSize: number;
  /**
   * A run owns an immutable production shape. Project settings may change
   * while a durable workflow is paused, but that must never change the book
   * the author already approved and funded.
   */
  targetChapters: number;
  targetWordsPerChapter: number;
  /** Single-chapter replacement must override a stale persisted outline target. */
  chapterRegeneration?: true;
  /**
   * Durable identity for a single-chapter request key. Historical chapter runs
   * may omit it, but they cannot be safely reattached through a new request.
   */
  chapterRegenerationTarget?: {
    chapterId: string;
    chapterNumber: number;
  };
  /**
   * Every mutable project field consulted by an authoring agent. Workflow
   * steps read this snapshot rather than the live project row so an edit made
   * while a durable run is paused cannot silently change its output.
   */
  inputSnapshot: GenerationInputSnapshot;
  /** Fresh artifacts remain private to the run until preparation commits them. */
  stagedConcept?: BookConcept;
  stagedOutline?: BookOutline;
  preparation?: GenerationPreparationState;
  /** Recoverable audit snapshot captured immediately before fresh canon retires. */
  retiredEntityCanon?: RetiredEntityCanon;
  /** Metered intermediate results that make a retried step continue, not restart. */
  work?: GenerationWorkState;
  /** Fully applied, reusable expensive work with source provenance. */
  completion?: GenerationCompletionState;
  /** Final durable boundary: live manuscript and staged artifacts are committed. */
  manuscriptPrepared?: boolean;
  /**
   * Exact live chapter identity/order at the preparation boundary. A retry
   * inherits number-keyed work only when this still matches the database.
   */
  chapterTopologyFingerprint?: string;
  /**
   * Exact latest persisted-outline provenance at the preparation boundary.
   * An outline edit after failure must make the next attempt fresh.
   */
  liveOutlineFingerprint?: string;
  /** Failed/cancelled same-input run whose completed artifacts may be reused. */
  resumeFromRunId?: string;
  /** Root run whose logical billing keys survive a retry chain. */
  billingLineageRunId?: string;
};

type GenerationShape = Omit<
  GenerationConfig,
  | "resumeFromRunId"
  | "billingLineageRunId"
  | "stagedConcept"
  | "stagedOutline"
  | "preparation"
  | "retiredEntityCanon"
  | "work"
  | "completion"
  | "manuscriptPrepared"
>;

export type GenerationPreparationAction =
  | "reset_manuscript"
  | "reset_entity_canon"
  | "persist_concept"
  | "persist_outline"
  | "mark_prepared"
  | "complete";

export function nextGenerationPreparationAction(
  config: Pick<GenerationConfig, "preparation" | "manuscriptPrepared">,
): GenerationPreparationAction {
  if (config.manuscriptPrepared === true) return "complete";
  if (config.preparation?.manuscriptReset !== true) return "reset_manuscript";
  if (config.preparation.entityCanonReset !== true) return "reset_entity_canon";
  if (config.preparation.conceptPersisted !== true) return "persist_concept";
  if (config.preparation.outlinePersisted !== true) return "persist_outline";
  return "mark_prepared";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * A prepared source can be reused only while the current run still approves
 * exactly that source's plan. A rejected/revised outline deliberately breaks
 * this match and forces a fresh commit boundary.
 */
export function stagedArtifactsMatch(
  current: Pick<GenerationConfig, "stagedConcept" | "stagedOutline">,
  source: Pick<GenerationConfig, "stagedConcept" | "stagedOutline">,
): boolean {
  return (
    current.stagedConcept !== undefined &&
    current.stagedOutline !== undefined &&
    source.stagedConcept !== undefined &&
    source.stagedOutline !== undefined &&
    stableJson(current.stagedConcept) === stableJson(source.stagedConcept) &&
    stableJson(current.stagedOutline) === stableJson(source.stagedOutline)
  );
}

export function sameGenerationShape(
  next: GenerationShape,
  prior: Partial<GenerationConfig> | null | undefined,
): boolean {
  const priorInput = prior?.inputSnapshot;
  if (!priorInput) return false;
  return (
    (prior?.productionMode ?? "full_book") === (next.productionMode ?? "full_book") &&
    prior?.tier === next.tier &&
    prior.requireOutlineApproval === next.requireOutlineApproval &&
    prior.waveSize === next.waveSize &&
    prior.targetChapters === next.targetChapters &&
    prior.targetWordsPerChapter === next.targetWordsPerChapter &&
    prior.chapterTopologyFingerprint === next.chapterTopologyFingerprint &&
    prior.liveOutlineFingerprint === next.liveOutlineFingerprint &&
    stableJson(priorInput) === stableJson(next.inputSnapshot)
  );
}

/**
 * Only an interrupted full-book run with the same complete frozen authoring
 * input is a retry. Completed books and any changed input start fresh.
 */
export function resumableRunId(
  next: GenerationShape,
  prior:
    | {
        id: string;
        status: string;
        config: Partial<GenerationConfig> | null | undefined;
      }
    | null
    | undefined,
): string | undefined {
  if (!prior || (prior.status !== "failed" && prior.status !== "cancelled")) return undefined;
  if (!sameGenerationShape(next, prior.config)) return undefined;
  // Before this boundary, staged artifacts may be incomplete and the live
  // manuscript may be only partially reset. A new run must prepare afresh.
  if (prior.config?.manuscriptPrepared !== true) return undefined;
  // Use the most recent compatible attempt. Each retry inherits its source
  // artifacts and checkpoints, so the latest run contains the fullest durable
  // provenance (including chapters completed after the original failure).
  return prior.id;
}

/** Candidates must be newest-first; returns the latest compatible prepared run. */
export function latestResumableRunId(
  next: GenerationShape,
  candidates: Array<{
    id: string;
    status: string;
    config: Partial<GenerationConfig> | null | undefined;
  }>,
): string | undefined {
  // Attempts are newest-first. Any newer attempt is a provenance barrier:
  // skipping over it could attach old number-keyed checkpoints to live state
  // produced, completed, or invalidated by the newer run.
  return candidates[0] ? resumableRunId(next, candidates[0]) : undefined;
}

/** Logical metering lineage used by every durable paid artifact. */
export function generationBillingScope(
  config: Pick<GenerationConfig, "billingLineageRunId">,
  currentRunId: string,
  scope: string,
): string {
  return `generation:${config.billingLineageRunId ?? currentRunId}:${scope}`;
}

export function severResumeBillingLineage(
  config: GenerationConfig,
  currentRunId: string,
): GenerationConfig {
  if (!config.resumeFromRunId && config.billingLineageRunId === currentRunId) return config;
  if (!config.resumeFromRunId && !config.billingLineageRunId) return config;
  return {
    ...config,
    billingLineageRunId: currentRunId,
    resumeFromRunId: undefined,
    preparation: undefined,
    retiredEntityCanon: undefined,
    work: {
      ...(config.work?.conceptExpanded ? { conceptExpanded: config.work.conceptExpanded } : {}),
    },
    completion: undefined,
    manuscriptPrepared: undefined,
  };
}

/** One outline revision is accepted per run; never place author notes/PII in an indexed key. */
export const OUTLINE_REVISION_RESERVATION_KEY = "outline-revision";

export function rebaseGenerationStartState(
  config: GenerationConfig,
  locked: GenerationConfig,
): GenerationConfig {
  return sameGenerationShape(locked, config)
    ? config
    : {
        ...locked,
        resumeFromRunId: undefined,
        billingLineageRunId: undefined,
      };
}
