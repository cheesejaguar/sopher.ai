import { generateText, isStepCount, Output, streamText } from "ai";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { MODELS, type QualityTier } from "@/ai/models";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { buildToolset, type ToolCtx } from "@/ai/tools";
import { WRITER_SYSTEM_PROMPT } from "@/ai/prompts/writer";
import {
  critiqueSchema,
  revisionSchema,
  scenePlanSchema,
  type ChapterOutlinePlan,
  type Critique,
  type ScenePlan,
} from "@/ai/schemas";
import { analyzeQuality } from "@/ai/analysis/quality-metrics";
import { chapterGuidance } from "@/ai/knowledge/plot-structures";
import { voicePrompt, type VoiceProfileId } from "@/ai/knowledge/voice-profiles";
import { anthropicCachedSystem } from "@/ai/cache";

export type ChapterWriterCtx = {
  meter: MeterCtx;
  tools: ToolCtx;
  tier: QualityTier;
  chapterNumber: number;
  totalChapters: number;
  chapterOutline: ChapterOutlinePlan;
  prevSummaries: { chapterNumber: number; title: string | null; summary: string | null }[];
  genre?: string;
  styleGuide?: string;
  voiceProfile?: string;
  plotStructure?: string;
  contentGuidelines?: string;
  targetWords: number;
  onProseDelta?: (delta: string) => void | Promise<void>;
};

export type ChapterResult = {
  content: string;
  wordCount: number;
  qualityScore: number;
  critique: Critique | null;
};

// Book-static system prompt — byte-identical across every writer call in a run,
// so the Anthropic cache prefix hits on all of them.
export function writerSystem(ctx: ChapterWriterCtx): string {
  const parts = [WRITER_SYSTEM_PROMPT];
  if (ctx.genre) parts.push(`## Genre\nThis book is ${ctx.genre}.`);
  if (ctx.voiceProfile) {
    const voice = voicePrompt(ctx.voiceProfile as VoiceProfileId);
    if (voice) parts.push(`## Voice\n${voice}`);
  }
  if (ctx.styleGuide) parts.push(`## Style Guide\n${ctx.styleGuide}`);
  if (ctx.contentGuidelines) parts.push(`## Content Guidelines\n${ctx.contentGuidelines}`);
  return parts.join("\n\n");
}

function planPrompt(ctx: ChapterWriterCtx): string {
  const beat = ctx.plotStructure
    ? chapterGuidance(ctx.plotStructure, ctx.chapterNumber, ctx.totalChapters)
    : undefined;
  const summaries = ctx.prevSummaries
    .map((s) => `Chapter ${s.chapterNumber} (${s.title ?? "untitled"}): ${s.summary ?? ""}`)
    .join("\n");
  return [
    `Plan the scenes for chapter ${ctx.chapterNumber} of ${ctx.totalChapters} before drafting.`,
    `## Chapter outline\n${JSON.stringify(ctx.chapterOutline, null, 2)}`,
    summaries ? `## Recent chapters\n${summaries}` : "",
    beat ? `## Plot-structure guidance\n${JSON.stringify(beat)}` : "",
    `Break the chapter into 2-5 scenes. For each scene name the beat it serves, the POV character's goal, the conflict, the exact state the scene must end in, and which characters appear.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function draftPrompt(ctx: ChapterWriterCtx, plan: ScenePlan): string {
  return [
    `Write chapter ${ctx.chapterNumber}: "${ctx.chapterOutline.title}" in full.`,
    `Target length: about ${ctx.targetWords} words. Output plain markdown prose only — no JSON, no notes, no headings other than scene breaks if the style calls for them.`,
    `## Scene plan\n${JSON.stringify(plan, null, 2)}`,
    `## Working method`,
    `Before writing a scene involving a character, call characterBibleGet for them. When you need an earlier event's details, call storySoFarSearch instead of inventing them. After you finish the draft, call characterBibleUpdate for any character you established new canonical facts about, then stop.`,
    `Open with: ${ctx.chapterOutline.openingHook}`,
    `Close with: ${ctx.chapterOutline.closingHook}`,
  ].join("\n\n");
}

function critiquePrompt(ctx: ChapterWriterCtx, draft: string, metricsNote: string): string {
  return [
    `Critique this draft of chapter ${ctx.chapterNumber} against the scene plan and craft principles. Judge honestly; "pass" only if it needs no major fixes.`,
    `## Draft\n${draft}`,
    `## Measured heuristics (free analysis)\n${metricsNote}`,
    `For each issue quote the exact problematic span (verbatim, 10-40 words) so it can be located, name the problem, and give a concrete fix. Score 0-1 overall.`,
  ].join("\n\n");
}

function revisePrompt(draft: string, critique: Critique): string {
  const majors = critique.issues.filter((i) => i.severity === "major");
  return [
    `Revise only the flagged passages of this chapter. Return replacements: for each, "original" must be an exact verbatim span from the draft and "revised" its improved version. Do not rewrite unflagged text.`,
    `## Draft\n${draft}`,
    `## Issues to fix\n${JSON.stringify(majors, null, 2)}`,
  ].join("\n\n");
}

function applyReplacements(draft: string, replacements: { original: string; revised: string }[]) {
  let out = draft;
  for (const r of replacements) {
    if (r.original && out.includes(r.original)) {
      out = out.replace(r.original, r.revised);
    }
  }
  return out;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function writeChapter(ctx: ChapterWriterCtx): Promise<ChapterResult> {
  const models = MODELS[ctx.tier];
  const system = writerSystem(ctx);

  const plan = await metered(
    ctx.meter,
    { role: "writer", operation: "writer.plan", model: models.planner },
    () =>
      generateText({
        model: models.planner,
        instructions: system,
        prompt: planPrompt(ctx),
        output: Output.object({ schema: scenePlanSchema }),
        providerOptions: gatewayOptions(ctx.meter, "writer"),
      }),
  );

  const draftResult = await metered(
    ctx.meter,
    { role: "writer", operation: "writer.draft", model: models.prose },
    async () => {
      const stream = streamText({
        model: models.prose,
        instructions: anthropicCachedSystem(system),
        prompt: draftPrompt(ctx, plan.output),
        tools: buildToolset("writer", ctx.tools),
        stopWhen: isStepCount(8),
        prepareStep: ({ stepNumber }) => (stepNumber >= 6 ? { activeTools: [] } : {}),
        maxOutputTokens: Math.min(32_000, Math.round(ctx.targetWords * 2.7)),
        providerOptions: gatewayOptions(ctx.meter, "writer", { withFallbacks: true }),
      });
      let text = "";
      for await (const delta of stream.textStream) {
        text += delta;
        await ctx.onProseDelta?.(delta);
      }
      const usage = await stream.usage;
      return { text, usage };
    },
  );
  const draft = draftResult.text.trim();

  const metrics = analyzeQuality(draft);
  const metricsNote = JSON.stringify({
    readability: metrics.readability,
    voice: metrics.voiceAnalysis,
    adverbs: metrics.adverbAnalysis,
    dialogue: metrics.dialogueRatio,
    overallScore: metrics.overallScore,
    wordCount: countWords(draft),
    targetWords: ctx.targetWords,
  });

  if (ctx.tier === "draft") {
    return {
      content: draft,
      wordCount: countWords(draft),
      qualityScore: 0.75,
      critique: null,
    };
  }

  const critique = await metered(
    ctx.meter,
    { role: "writer", operation: "writer.critique", model: models.critic },
    () =>
      generateText({
        model: models.critic,
        instructions: anthropicCachedSystem(system),
        prompt: critiquePrompt(ctx, draft, metricsNote),
        output: Output.object({ schema: critiqueSchema }),
        providerOptions: gatewayOptions(ctx.meter, "writer"),
      }),
  );

  const verdict = critique.output;
  if (verdict.verdict === "pass" || !verdict.issues.some((i) => i.severity === "major")) {
    return {
      content: draft,
      wordCount: countWords(draft),
      qualityScore: verdict.score,
      critique: verdict,
    };
  }

  const revision = await metered(
    ctx.meter,
    { role: "writer", operation: "writer.revise", model: models.prose },
    () =>
      generateText({
        model: models.prose,
        instructions: anthropicCachedSystem(system),
        prompt: revisePrompt(draft, verdict),
        output: Output.object({ schema: revisionSchema }),
        providerOptions: gatewayOptions(ctx.meter, "writer", { withFallbacks: true }),
      }),
  );

  const revised = applyReplacements(draft, revision.output.replacements);
  return {
    content: revised,
    wordCount: countWords(revised),
    qualityScore: Math.min(1, verdict.score + 0.1),
    critique: verdict,
  };
}

/** Persists the finished chapter and bumps status; returns the chapter row id. */
export async function persistChapter(
  ctx: ChapterWriterCtx,
  result: ChapterResult,
): Promise<string> {
  const db = getDb();
  const [row] = await db
    .update(schema.chapters)
    .set({
      content: result.content,
      wordCount: result.wordCount,
      qualityScore: result.qualityScore.toFixed(3),
      status: "drafted",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.chapters.bookId, ctx.tools.bookId),
        eq(schema.chapters.chapterNumber, ctx.chapterNumber),
      ),
    )
    .returning({ id: schema.chapters.id });
  return row.id;
}
