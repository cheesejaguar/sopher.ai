import { generateText, isStepCount, Output } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { getDb, schema, withDbTransaction, type DbTransaction } from "@/db";
import { MODELS, type QualityTier } from "@/ai/models";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { assertMeteredInputWithinBudget, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { buildToolset, type ToolCtx } from "@/ai/tools";
import { CONTINUITY_SYSTEM_PROMPT } from "@/ai/prompts/continuity";
import {
  REVIEW_PHASES_BY_KEY,
  buildReviewPhasePrompt,
  continuityPhaseKeys,
  scoreToRecommendation,
  type ReviewPhaseKey,
} from "@/ai/prompts/review-rubric";
import { reviewPhaseResultSchema, type ReviewPhaseResult } from "@/ai/schemas";
import { anthropicCachedSystem } from "@/ai/cache";

export type ContinuityReport = {
  score: number;
  recommendation: string;
  phases: { key: ReviewPhaseKey; score: number; summary: string }[];
  issues: ReviewPhaseResult["issues"];
  worstChapters: number[];
};

export type ContinuityOutcome = {
  key: ReviewPhaseKey;
  weight: number;
  result: ReviewPhaseResult;
};

type ContinuityIssue = ReviewPhaseResult["issues"][number];

const SEVERITY_RANK: Record<ContinuityIssue["severity"], number> = {
  critical: 3,
  major: 2,
  minor: 1,
};

export { continuityPhaseKeys } from "@/ai/prompts/review-rubric";

/** Chapter summaries corpus, rendered once and reused verbatim by every phase call. */
function summariesCorpus(
  rows: { chapterNumber: number; title: string | null; summary: string | null }[],
): string {
  return rows
    .map(
      (r) =>
        `Chapter ${r.chapterNumber} (${r.title ?? "untitled"}): ${
          r.summary?.trim() || "(no summary available)"
        }`,
    )
    .join("\n");
}

function phaseUserPrompt(key: ReviewPhaseKey, corpus: string): string {
  return [
    buildReviewPhasePrompt(key),
    `## Manuscript (chapter summaries)\n${corpus}`,
    [
      `The summaries above are your map, not your evidence: before flagging a specific issue,`,
      `spot-check the actual prose with chaptersGetText (and characterBibleGet or`,
      `storySoFarSearch as needed). Do not call continuityRecordIssue — issues are persisted`,
      `separately from your answer. Ignore the JSON template above; return your analysis in`,
      `the structured output format provided: score from 0 to 1, summary, strengths, and issues`,
      `(each with chapters, category, severity, description, suggestedFix).`,
    ].join(" "),
  ].join("\n\n");
}

function chaptersOverlap(a: number[], b: number[]): boolean {
  if (a.length === 0 && b.length === 0) return true;
  return a.some((c) => b.includes(c));
}

function descriptionWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function similarDescriptions(a: string, b: string): boolean {
  const wordsA = descriptionWords(a);
  const wordsB = descriptionWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  let shared = 0;
  for (const w of wordsA) if (wordsB.has(w)) shared += 1;
  return shared / Math.min(wordsA.size, wordsB.size) >= 0.6;
}

/**
 * Same category + overlapping chapters + similar description = the same finding
 * reported by two phases; keep the copy with the highest severity.
 */
function dedupeIssues(issues: ContinuityIssue[]): ContinuityIssue[] {
  const kept: ContinuityIssue[] = [];
  for (const issue of issues) {
    const dupIndex = kept.findIndex(
      (k) =>
        k.category === issue.category &&
        chaptersOverlap(k.chapters, issue.chapters) &&
        similarDescriptions(k.description, issue.description),
    );
    if (dupIndex === -1) {
      kept.push(issue);
    } else if (SEVERITY_RANK[issue.severity] > SEVERITY_RANK[kept[dupIndex].severity]) {
      kept[dupIndex] = issue;
    }
  }
  return kept;
}

/** Chapters appearing most often in critical/major issues, at most three. */
function worstChapters(issues: ContinuityIssue[]): number[] {
  const counts = new Map<number, number>();
  for (const issue of issues) {
    if (issue.severity === "minor") continue;
    for (const chapter of issue.chapters) {
      counts.set(chapter, (counts.get(chapter) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, 3)
    .map(([chapter]) => chapter);
}

/**
 * One rubric phase as a single metered LLM call — the unit of workflow
 * checkpointing, so a retry never re-bills phases that already finished.
 */
export async function runContinuityPhase(
  input: { meter: MeterCtx; tools: ToolCtx; tier: QualityTier },
  phaseKey: ReviewPhaseKey,
): Promise<ContinuityOutcome> {
  const db = getDb();
  const rows = await db
    .select({
      chapterNumber: schema.chapters.chapterNumber,
      title: schema.chapters.title,
      summary: schema.chapters.summary,
    })
    .from(schema.chapters)
    .where(
      and(
        eq(schema.chapters.bookId, input.tools.bookId),
        sql`not (
          ${schema.chapters.status} = 'planned'
          and ${schema.chapters.wordCount} = 0
          and ${schema.chapters.title} is null
          and ${schema.chapters.summary} is null
        )`,
      ),
    )
    .orderBy(schema.chapters.chapterNumber);

  const corpus = summariesCorpus(rows);
  const model = MODELS[input.tier].continuity;
  const result = await metered(
    input.meter,
    { role: "continuity", operation: `continuity.${phaseKey}`, model },
    () =>
      generateText({
        model,
        instructions: anthropicCachedSystem(CONTINUITY_SYSTEM_PROMPT),
        prompt: phaseUserPrompt(phaseKey, corpus),
        tools: buildToolset("continuity", input.tools),
        stopWhen: isStepCount(5),
        // Force the final step to produce the structured result — without
        // this, a phase that spends every step on tool spot-checks ends with
        // no output and the whole review fails.
        prepareStep: (options) => {
          assertMeteredInputWithinBudget(
            `continuity.${phaseKey}`,
            {
              instructions: options.instructions,
              messages: options.messages,
            },
            options.stepNumber,
          );
          return options.stepNumber >= 3 ? { activeTools: [] } : {};
        },
        maxOutputTokens: meteredMaxOutputTokens(`continuity.${phaseKey}`),
        output: Output.object({ schema: reviewPhaseResultSchema }),
        providerOptions: gatewayOptions(input.meter, "continuity"),
      }),
  );
  return {
    key: phaseKey,
    weight: REVIEW_PHASES_BY_KEY[phaseKey].weight,
    result: result.output,
  };
}

/**
 * Pure aggregation of phase outcomes: weighted score (renormalized over the
 * phases actually run), recommendation ladder, deduped issues, worst chapters.
 */
export function aggregateContinuityOutcomes(outcomes: ContinuityOutcome[]): ContinuityReport {
  const totalWeight = outcomes.reduce((sum, o) => sum + o.weight, 0);
  const score =
    totalWeight > 0
      ? outcomes.reduce((sum, o) => sum + o.result.score * o.weight, 0) / totalWeight
      : 0;
  const issues = dedupeIssues(outcomes.flatMap((o) => o.result.issues));
  return {
    score,
    recommendation: scoreToRecommendation(score),
    phases: outcomes.map((o) => ({ key: o.key, score: o.result.score, summary: o.result.summary })),
    issues,
    worstChapters: worstChapters(issues),
  };
}

export async function persistContinuityIssues(
  bookId: string,
  runId: string | null | undefined,
  issues: ContinuityIssue[],
  transaction?: DbTransaction,
): Promise<void> {
  const persist = async (db: DbTransaction) => {
    // A workflow step may retry after inserts commit but before its return is
    // checkpointed. Replace this run's finding set so retries cannot duplicate
    // rows or leave findings from a partially completed aggregation.
    if (runId) {
      await db.delete(schema.continuityIssues).where(eq(schema.continuityIssues.runId, runId));
    }
    if (issues.length === 0) return;
    await db.insert(schema.continuityIssues).values(
      issues.map((issue) => ({
        bookId,
        runId: runId ?? null,
        chapters: issue.chapters,
        category: issue.category,
        severity: issue.severity,
        description: issue.description,
        suggestedFix: issue.suggestedFix,
      })),
    );
  };
  if (transaction) return persist(transaction);
  await withDbTransaction(persist);
}

/**
 * Full review as one call — used by ops scripts. The workflow runs the same
 * pieces as separate checkpointed steps instead.
 */
export async function runContinuityReview(input: {
  meter: MeterCtx;
  tools: ToolCtx;
  tier: QualityTier;
  runId?: string | null;
}): Promise<ContinuityReport> {
  const outcomes: ContinuityOutcome[] = [];
  for (const key of continuityPhaseKeys(input.tier)) {
    outcomes.push(await runContinuityPhase(input, key));
  }
  const report = aggregateContinuityOutcomes(outcomes);
  await persistContinuityIssues(input.tools.bookId, input.runId, report.issues);
  return report;
}
