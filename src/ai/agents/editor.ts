import { generateText, Output } from "ai";
import { z } from "zod";
import { MODELS, type QualityTier } from "@/ai/models";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import type { ToolCtx } from "@/ai/tools";
import { buildEditUserPrompt, EDITOR_SYSTEM_PROMPT } from "@/ai/prompts/editor";
import { editSuggestionListSchema, type EditSuggestionList } from "@/ai/schemas";
import { analyzeQuality, getQualityRecommendations } from "@/ai/analysis/quality-metrics";
import { analyzePacing } from "@/ai/analysis/pacing";
import { anthropicCachedSystem } from "@/ai/cache";

export type EditChapterInput = {
  meter: MeterCtx;
  tools: ToolCtx;
  tier: QualityTier;
  chapterNumber: number;
  content: string;
  styleGuide?: string;
  chapterOutline?: unknown;
};

export type EditChapterResult = {
  content: string;
  changed: boolean;
  notes: string[];
};

export type ReviewChapterInput = {
  meter: MeterCtx;
  tools: ToolCtx;
  tier: QualityTier;
  chapterNumber: number;
  content: string;
  instruction?: string;
};

const MAX_REPLACEMENTS = 15;

const editReplacementsSchema = z.object({
  replacements: z
    .array(
      z.object({
        original: z.string().describe("Exact verbatim span copied from the draft"),
        revised: z.string().describe("The improved version of that span"),
        reason: z.string().describe("One-line reason for the change"),
      }),
    )
    .max(MAX_REPLACEMENTS),
  notes: z.array(z.string()).max(10).describe("Short overall editorial notes"),
});

// FREE TRIAGE — non-LLM heuristics computed in code so the edit pass is
// grounded in measurements instead of guesses.
function buildMetricsNote(content: string): string {
  const quality = analyzeQuality(content);
  const pacing = analyzePacing(content);
  return JSON.stringify({
    readability: quality.readability,
    sentenceVariety: quality.sentenceVariety,
    voice: quality.voiceAnalysis,
    adverbs: quality.adverbAnalysis,
    dialogue: quality.dialogueRatio,
    overallQualityScore: quality.overallScore,
    pacing: {
      overallPacingScore: pacing.overallPacingScore,
      tensionCurve: pacing.tensionCurve,
      actionBalance: pacing.actionBalance,
      ending: pacing.endingAnalysis,
    },
    recommendations: [...getQualityRecommendations(quality), ...pacing.recommendations],
  });
}

function outlineToText(outline: unknown): string | undefined {
  if (outline == null) return undefined;
  if (typeof outline === "string") return outline;
  return JSON.stringify(outline, null, 2);
}

function editPrompt(input: EditChapterInput, metricsNote: string): string {
  return [
    buildEditUserPrompt({
      chapterNumber: input.chapterNumber,
      chapterContent: input.content,
      styleGuide: input.styleGuide,
      chapterOutline: outlineToText(input.chapterOutline),
    }),
    `## Measured heuristics (free analysis)\n${metricsNote}`,
    [
      `## Output format (this overrides the response format in your instructions)`,
      `Return targeted replacements, not a rewritten chapter. For each replacement, "original" must be an exact verbatim span copied from the draft (roughly 10-60 words) and "revised" its improved version, with a one-line reason.`,
      `At most ${MAX_REPLACEMENTS} replacements — pick only the highest-impact fixes the measurements and your judgment support.`,
      `Respect the author's voice: light touch — refinement, not rewriting. Leave everything you do not flag untouched.`,
      `Put overall observations in "notes" as short strings.`,
    ].join("\n"),
  ].join("\n\n");
}

// Same contract as chapter-writer's applyReplacements: exact-match spans only,
// non-matching spans are skipped.
function applyReplacements(
  draft: string,
  replacements: { original: string; revised: string }[],
): { content: string; skipped: number } {
  let out = draft;
  let skipped = 0;
  for (const r of replacements) {
    if (r.original && out.includes(r.original)) {
      out = out.replace(r.original, r.revised);
    } else {
      skipped += 1;
    }
  }
  return { content: out, skipped };
}

/**
 * Editorial pass over a drafted chapter: free heuristic triage in code, then a
 * single structured edit call that returns verbatim-span replacements applied
 * locally. Never rewrites the whole chapter.
 */
export async function editChapter(input: EditChapterInput): Promise<EditChapterResult> {
  const model = MODELS[input.tier].editor;
  const metricsNote = buildMetricsNote(input.content);

  const result = await metered(
    input.meter,
    { role: "editor", operation: "editor.edit", model },
    () =>
      generateText({
        model,
        instructions: anthropicCachedSystem(EDITOR_SYSTEM_PROMPT),
        prompt: editPrompt(input, metricsNote),
        output: Output.object({ schema: editReplacementsSchema }),
        providerOptions: gatewayOptions(input.meter, "editor"),
      }),
  );

  const { replacements, notes } = result.output;
  const applied = applyReplacements(input.content, replacements);
  const allNotes = [...notes];
  if (applied.skipped > 0) {
    allNotes.push(
      `Skipped ${applied.skipped} suggested edit(s) whose original spans did not match the draft verbatim.`,
    );
  }

  return {
    content: applied.content,
    changed: applied.content !== input.content,
    notes: allNotes,
  };
}

function reviewPrompt(input: ReviewChapterInput, metricsNote: string): string {
  return [
    `Review chapter ${input.chapterNumber} and return anchored edit suggestions for the author to accept or reject individually. Do not rewrite the chapter.`,
    `## Chapter ${input.chapterNumber} Draft\n\n${input.content}`,
    `## Measured heuristics (free analysis)\n${metricsNote}`,
    input.instruction ? `## Author's focus for this review\n${input.instruction}` : "",
    [
      `## Output format (this overrides the response format in your instructions)`,
      `Return suggestions where "anchorText" is an exact verbatim quote copied from the chapter (at least 8 characters, unique enough to locate) and "replacement" is the proposed revised text for that quote.`,
      `Give a one-line rationale, a category (line, structure, continuity, style), and a severity (info, warning, error) for each.`,
      `Respect the author's voice: light touch — refinement, not rewriting. Only suggest changes the measurements or clear craft principles support.`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Anchored-suggestions mode for the web editor UI: one structured call that
 * returns suggestions keyed to exact verbatim quotes in the chapter.
 */
export async function reviewChapter(input: ReviewChapterInput): Promise<EditSuggestionList> {
  const model = MODELS[input.tier].editor;
  const metricsNote = buildMetricsNote(input.content);

  const result = await metered(
    input.meter,
    { role: "editor", operation: "editor.review", model },
    () =>
      generateText({
        model,
        instructions: anthropicCachedSystem(EDITOR_SYSTEM_PROMPT),
        prompt: reviewPrompt(input, metricsNote),
        output: Output.object({ schema: editSuggestionListSchema }),
        providerOptions: gatewayOptions(input.meter, "editor"),
      }),
  );

  return result.output;
}
