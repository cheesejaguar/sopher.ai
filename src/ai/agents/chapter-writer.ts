import { generateText, isStepCount, Output, streamText } from "ai";
import { MODELS, type QualityTier } from "@/ai/models";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import {
  assertMeteredInputWithinBudget,
  meteredInputGuard,
  meteredMaxOutputTokens,
  writerDraftMaxOutputTokens,
} from "@/ai/metering-limits";
import { buildToolset, type ToolCtx } from "@/ai/tools";
import { CHAPTER_PROSE_RESPONSE_FORMAT, WRITER_SYSTEM_PROMPT } from "@/ai/prompts/writer";
import {
  critiqueWireSchema,
  normalizeCritique,
  normalizeRevision,
  normalizeScenePlan,
  revisionWireSchema,
  scenePlanWireSchema,
  type ChapterOutlinePlan,
  type Critique,
  type ScenePlan,
} from "@/ai/schemas";
import { analyzeQuality } from "@/ai/analysis/quality-metrics";
import { chapterGuidance } from "@/ai/knowledge/plot-structures";
import { voicePrompt, type VoiceProfileId } from "@/ai/knowledge/voice-profiles";
import { anthropicCachedSystem } from "@/ai/cache";
import { normalizeManuscriptMarkdown } from "@/lib/manuscript-markdown";

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

export type ChapterWriterCheckpoint = {
  scenePlan?: ScenePlan;
  draft?: string;
  critique?: Critique;
  result?: ChapterResult;
};

export type ChapterWriterCheckpointOptions = {
  checkpoint?: ChapterWriterCheckpoint;
  onCheckpoint?: (checkpoint: ChapterWriterCheckpoint) => void | Promise<void>;
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
    `Target length: about ${ctx.targetWords} words.`,
    CHAPTER_PROSE_RESPONSE_FORMAT,
    `## Scene plan\n${JSON.stringify(plan, null, 2)}`,
    `## Working method`,
    `Before writing anything involving a person, place, object, organization or event, call entityGet for it — the story bible is canon and you must not contradict it. If you are unsure whether something already exists, call entitySearch before inventing it, so you do not create a near-duplicate under a slightly different name. When you need an earlier event's details, call storySoFarSearch instead of inventing them.`,
    `Make every lookup you need in a single round of parallel tool calls, then write the complete chapter in your next response. You have one round for lookups, one for the chapter and its canon updates, and a final response.`,
    `If you must introduce something new, derive its name from the entities it relates to: family members share surnames, and heritage governs naming. After you finish the draft, call entityUpsert for anything you established that later chapters must honor, entityRelate for any new relationship, then stop.`,
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
      // A replacer function: a string replacement would expand $&, $', $` and
      // $$ patterns that are ordinary characters in prose.
      out = out.replace(r.original, () => r.revised);
    }
  }
  return out;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * A step's text is held back from the live view until it reaches this many
 * characters. Tool-step chatter is a sentence or two; a chapter crosses this
 * within its first paragraph.
 */
const LIVE_PROSE_MIN_CHARS = 400;

/** A step shorter than this share of the longest step is not chapter prose. */
const PROSE_STEP_SHARE = 0.25;

/**
 * Below this share of the target length, the "chapter" is the writer's
 * working notes ("I'll start by checking the story bible…"), not prose.
 */
const DRAFT_MIN_SHARE_OF_TARGET = 0.25;

/**
 * The final draft step has no tools. A model that spent the earlier steps on
 * lookups otherwise ends here with one more "let me check…" line and stops,
 * which Sonnet 5.5 does when it follows the lookup instructions literally.
 */
const FINAL_DRAFT_TURN =
  "The story bible lookups are finished and tools are now closed. Using what you have gathered, write the complete chapter now: prose only, with no notes about your process.";

type DraftStep = { text: string; finishReason: string };

/**
 * Picks the chapter out of a multi-step tool loop.
 *
 * Finish reason cannot tell prose from chatter: the working method asks the
 * model to write the chapter and then record new canon, so the prose step
 * usually ends in tool calls, while the closing "I've recorded the new
 * entities." ends in `stop`. Length can: the chapter is the longest step by
 * an order of magnitude. Any other step at least a quarter as long is kept
 * too, in order, so a draft the model split around a mid-chapter lookup is
 * not cut in half.
 */
export function selectDraftProse(steps: readonly DraftStep[]): {
  text: string;
  truncated: boolean;
} {
  const longest = Math.max(0, ...steps.map((step) => step.text.trim().length));
  if (longest === 0) return { text: "", truncated: steps.at(-1)?.finishReason === "length" };
  const kept = steps.filter((step) => step.text.trim().length >= longest * PROSE_STEP_SHARE);
  return {
    text: kept.map((step) => step.text.trim()).join("\n\n"),
    truncated: kept.some((step) => step.finishReason === "length"),
  };
}

/**
 * The prose step hit its output ceiling, so the chapter stops mid-scene.
 * Retryable: a fresh sample at 2x the target word count rarely runs that long
 * twice, and the redo is compensated rather than billed again.
 */
export class ChapterDraftTruncatedError extends Error {
  readonly isRetryable = true;

  constructor(
    readonly chapterNumber: number,
    readonly maxOutputTokens: number,
  ) {
    super(
      `Chapter ${chapterNumber} draft reached its ${maxOutputTokens}-token output limit before the chapter ended`,
    );
    this.name = "ChapterDraftTruncatedError";
  }
}

/**
 * The writer returned working notes instead of a chapter. Retryable for the
 * same reason as truncation: saving it would put a sentence of process
 * commentary in the manuscript as the whole chapter.
 */
export class ChapterDraftIncompleteError extends Error {
  readonly isRetryable = true;

  constructor(
    readonly chapterNumber: number,
    readonly targetWords: number,
  ) {
    super(
      `Chapter ${chapterNumber} draft came back far shorter than its ${targetWords}-word target`,
    );
    this.name = "ChapterDraftIncompleteError";
  }
}

export async function writeChapter(
  ctx: ChapterWriterCtx,
  options: ChapterWriterCheckpointOptions = {},
): Promise<ChapterResult> {
  const models = MODELS[ctx.tier];
  const system = writerSystem(ctx);
  let checkpoint = options.checkpoint ?? {};
  const save = async (next: ChapterWriterCheckpoint) => {
    checkpoint = next;
    await options.onCheckpoint?.(checkpoint);
  };

  // A result without its text (pruned work state) is not a result: returning
  // it would persist an empty chapter.
  if (typeof checkpoint.result?.content === "string") return checkpoint.result;

  let plan = checkpoint.scenePlan;
  if (!plan) {
    const result = await metered(
      ctx.meter,
      { role: "writer", operation: "writer.plan", model: models.planner },
      () =>
        generateText({
          model: models.planner,
          // Same book-static system prompt as the draft, critique and revise
          // calls; every chapter's plan reads it from cache after the first.
          instructions: anthropicCachedSystem(system),
          prompt: planPrompt(ctx),
          maxOutputTokens: meteredMaxOutputTokens("writer.plan"),
          prepareStep: meteredInputGuard("writer.plan"),
          // Wire schema + normalizer: a seventh scene or a ninth character
          // used to fail validation and re-buy the plan.
          output: Output.object({ schema: scenePlanWireSchema }),
          providerOptions: gatewayOptions(ctx.meter, "writer", { model: models.planner }),
        }),
    );
    plan = normalizeScenePlan(result.output);
    await save({ ...checkpoint, scenePlan: plan });
  }

  let draft = checkpoint.draft;
  if (!draft) {
    const draftOutputTokens = writerDraftMaxOutputTokens(ctx.targetWords);
    const draftResult = await metered(
      ctx.meter,
      {
        role: "writer",
        operation: "writer.draft",
        model: models.prose,
        maxOutputTokens: draftOutputTokens,
      },
      async () => {
        const stream = streamText({
          model: models.prose,
          instructions: anthropicCachedSystem(system),
          prompt: draftPrompt(ctx, plan),
          tools: buildToolset("writer", ctx.tools),
          stopWhen: isStepCount(3),
          prepareStep: (options) => {
            assertMeteredInputWithinBudget(
              "writer.draft",
              {
                instructions: options.instructions,
                messages: options.messages,
              },
              options.stepNumber,
            );
            if (options.stepNumber < 2) return {};
            const longestWords = Math.max(0, ...options.steps.map((step) => countWords(step.text)));
            return longestWords >= ctx.targetWords * DRAFT_MIN_SHARE_OF_TARGET
              ? { activeTools: [] }
              : {
                  activeTools: [],
                  messages: [...options.messages, { role: "user", content: FINAL_DRAFT_TURN }],
                };
          },
          maxOutputTokens: draftOutputTokens,
          providerOptions: gatewayOptions(ctx.meter, "writer", {
            model: models.prose,
            withFallbacks: true,
          }),
        });
        // The loop's text spans every step, and only one of them is the
        // chapter: tool steps open with chatter ("I'll check the story bible
        // first…") and the step after the canon writes reports on them ("I've
        // recorded the new entities."). Live deltas are held per step until
        // the step has proved itself prose, so chatter never reaches the UI.
        let pending = "";
        let streaming = false;
        for await (const part of stream.fullStream) {
          if (part.type === "start-step") {
            pending = "";
            streaming = false;
          } else if (part.type === "text-delta") {
            if (streaming) {
              await ctx.onProseDelta?.(part.text);
            } else {
              pending += part.text;
              if (pending.trim().length >= LIVE_PROSE_MIN_CHARS) {
                streaming = true;
                await ctx.onProseDelta?.(pending);
              }
            }
          } else if (part.type === "error") {
            throw part.error;
          }
        }
        const [usage, response, steps] = await Promise.all([
          stream.usage,
          stream.response,
          stream.steps,
        ]);
        return { usage, response, steps, prose: selectDraftProse(steps) };
      },
    );
    // Thrown before the checkpoint save: a retry must redraft rather than
    // resume from a chapter that stops mid-sentence. The settled attempt is
    // compensated by metered()'s redo path, so the author pays once.
    if (draftResult.prose.truncated) {
      throw new ChapterDraftTruncatedError(ctx.chapterNumber, draftOutputTokens);
    }
    if (countWords(draftResult.prose.text) < ctx.targetWords * DRAFT_MIN_SHARE_OF_TARGET) {
      throw new ChapterDraftIncompleteError(ctx.chapterNumber, ctx.targetWords);
    }
    draft = normalizeManuscriptMarkdown(draftResult.prose.text);
    await save({ ...checkpoint, draft });
  }

  const normalizedDraft = normalizeManuscriptMarkdown(draft);
  if (normalizedDraft !== draft) {
    draft = normalizedDraft;
    await save({ ...checkpoint, draft });
  }

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
    const result = {
      content: draft,
      wordCount: countWords(draft),
      qualityScore: 0.75,
      critique: null,
    };
    await save({ ...checkpoint, result });
    return result;
  }

  let verdict = checkpoint.critique;
  if (!verdict) {
    const critique = await metered(
      ctx.meter,
      { role: "writer", operation: "writer.critique", model: models.critic },
      () =>
        generateText({
          model: models.critic,
          instructions: anthropicCachedSystem(system),
          prompt: critiquePrompt(ctx, draft, metricsNote),
          maxOutputTokens: meteredMaxOutputTokens("writer.critique"),
          prepareStep: meteredInputGuard("writer.critique"),
          // Permissive wire schema, then normalizeCritique back onto the strict
          // type. The strict schema used to sit here, and its invisible caps
          // meant a critique naming nine issues instead of eight — or scoring
          // the chapter 8 instead of 0.8 — threw NoObjectGeneratedError and
          // discarded a chapter that was already drafted and paid for.
          output: Output.object({ schema: critiqueWireSchema }),
          providerOptions: gatewayOptions(ctx.meter, "writer", { model: models.critic }),
        }),
    );
    // The score here is persisted as the chapter's qualityScore and decides
    // whether a revision pass runs at all, so it goes through the 0-1 rescale
    // rather than being trusted as-is.
    verdict = normalizeCritique(critique.output);
    await save({ ...checkpoint, critique: verdict });
  }
  if (verdict.verdict === "pass" || !verdict.issues.some((i) => i.severity === "major")) {
    const result = {
      content: draft,
      wordCount: countWords(draft),
      qualityScore: verdict.score,
      critique: verdict,
    };
    await save({ ...checkpoint, result });
    return result;
  }

  const revision = await metered(
    ctx.meter,
    { role: "writer", operation: "writer.revise", model: models.prose },
    () =>
      generateText({
        model: models.prose,
        instructions: anthropicCachedSystem(system),
        prompt: revisePrompt(draft, verdict),
        maxOutputTokens: meteredMaxOutputTokens("writer.revise"),
        prepareStep: meteredInputGuard("writer.revise"),
        output: Output.object({ schema: revisionWireSchema }),
        providerOptions: gatewayOptions(ctx.meter, "writer", {
          model: models.prose,
          withFallbacks: true,
        }),
      }),
  );

  // normalizeRevision drops a replacement whose `revised` text is missing
  // instead of defaulting it to "" — the default would apply as a deletion and
  // silently cut the anchored passage out of the author's chapter.
  const revised = normalizeManuscriptMarkdown(
    applyReplacements(draft, normalizeRevision(revision.output).replacements),
  );
  // Only credit the revision bump when at least one replacement actually landed.
  const qualityScore = revised === draft ? verdict.score : Math.min(1, verdict.score + 0.1);
  const result = {
    content: revised,
    wordCount: countWords(revised),
    qualityScore,
    critique: verdict,
  };
  await save({ ...checkpoint, result });
  return result;
}
