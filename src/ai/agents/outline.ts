import { generateText, Output } from "ai";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { MODELS, type QualityTier } from "@/ai/models";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import type { ToolCtx } from "@/ai/tools";
import { buildOutlineUserPrompt, OUTLINE_SYSTEM_PROMPT } from "@/ai/prompts/outline";
import { bookOutlineSchema, type BookConcept, type BookOutline } from "@/ai/schemas";
import {
  getPlotTemplate,
  getTemplateSummary,
  PLOT_STRUCTURE_IDS,
  type PlotTemplate,
} from "@/ai/knowledge/plot-structures";
import { outlinePromptAdditions } from "@/ai/knowledge/genres";
import { anthropicCachedSystem } from "@/ai/cache";

export type OutlineInput = {
  meter: MeterCtx;
  tools: ToolCtx;
  tier: QualityTier;
  concept: BookConcept;
  brief?: string;
  genre?: string;
  chapterCount: number;
  targetWordsPerChapter: number;
  plotStructure?: string;
  /** Author feedback on a rejected outline; the regenerated outline must address it. */
  revisionNotes?: string;
};

// Internal to this agent: the cheap structure-plan call's output shape.
const structurePlanSchema = z.object({
  plotStructure: z
    .string()
    .describe("One of: three_act, five_act, heros_journey, seven_point, save_the_cat"),
  acts: z
    .array(
      z.object({
        name: z.string(),
        startChapter: z.number().int().min(1),
        endChapter: z.number().int().min(1),
        arc: z.string().describe("One-line arc for this act"),
      }),
    )
    .min(2)
    .max(8),
});
type StructurePlan = z.infer<typeof structurePlanSchema>;

function conceptText(concept: BookConcept): string {
  return [
    `Title: ${concept.title}`,
    `Logline: ${concept.logline}`,
    `Synopsis: ${concept.synopsis}`,
    `Setting: ${concept.setting}`,
    `Central conflict: ${concept.centralConflict}`,
    concept.themes.length > 0 ? `Themes: ${concept.themes.join(", ")}` : "",
    concept.uniqueElements.length > 0
      ? `Unique elements: ${concept.uniqueElements.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function characterProfilesText(concept: BookConcept): string | undefined {
  if (concept.characters.length === 0) return undefined;
  return concept.characters
    .map((c) => `- ${c.name} (${c.role}): ${c.description} Arc: ${c.arc}`)
    .join("\n");
}

// Knowledge injected as prompt text — cheaper than a tool loop for a one-shot choice.
function structurePlanPrompt(input: OutlineInput): string {
  const canonicalIds = PLOT_STRUCTURE_IDS.filter((id) => id !== "freytags_pyramid");
  const requested = input.plotStructure ? getTemplateSummary(input.plotStructure) : undefined;
  const genreNotes = input.genre ? outlinePromptAdditions(input.genre) : undefined;
  const optionList = canonicalIds
    .map((id) => {
      const t = getPlotTemplate(id);
      return t ? `- ${id}: ${t.name} — ${t.description}` : "";
    })
    .filter(Boolean)
    .join("\n");
  return [
    `Plan the plot structure for a ${input.chapterCount}-chapter book before outlining it.`,
    `## Book concept\n${conceptText(input.concept)}`,
    input.brief ? `## Author brief\n${input.brief}` : "",
    input.revisionNotes
      ? `## Revision notes from the author\n${input.revisionNotes}\nAccount for these when choosing the structure and act boundaries.`
      : "",
    genreNotes ? genreNotes.trim() : "",
    requested
      ? [
          `## Requested structure`,
          `The author asked for "${input.plotStructure}". Keep it unless it clearly fights the concept.`,
          JSON.stringify(requested),
        ].join("\n")
      : `## Available structures\n${optionList}`,
    [
      `Choose plotStructure (one of: ${canonicalIds.join(", ")}).`,
      `Then divide chapters 1..${input.chapterCount} into acts: contiguous chapter ranges that cover every chapter exactly once, with a one-line arc per act.`,
    ].join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function resolveStructureId(chosen: string, requested?: string): string {
  if (getPlotTemplate(chosen)) return chosen;
  if (requested && getPlotTemplate(requested)) return requested;
  return requested ?? chosen;
}

function outlinePrompt(input: OutlineInput, plan: StructurePlan, structureId: string): string {
  const base = buildOutlineUserPrompt({
    concept: conceptText(input.concept),
    brief: input.brief,
    genre: input.genre,
    chapterCount: input.chapterCount,
    chapterLengthTarget: input.targetWordsPerChapter,
    characterProfiles: characterProfilesText(input.concept),
  });
  const actPlan = plan.acts
    .map((a) => `- ${a.name} (chapters ${a.startChapter}-${a.endChapter}): ${a.arc}`)
    .join("\n");
  return [
    base,
    `## Act plan (${structureId})\n${actPlan}`,
    input.revisionNotes
      ? `## Revision notes (must address)\nThe author rejected a previous outline with this feedback:\n${input.revisionNotes}`
      : "",
    [
      `## Hard requirements`,
      `- Exactly ${input.chapterCount} chapters, numbered 1 through ${input.chapterCount}.`,
      `- Every chapter's targetWords within 20% of ${input.targetWordsPerChapter}.`,
      `- Set plotStructure to "${structureId}".`,
      `- Place structure beats according to the act plan above.`,
      `- Hook chaining: each chapter's closingHook must raise the question that the next chapter's openingHook picks up.`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Cheap deterministic checks that gate the LLM self-check: chapter count,
 * sequential numbering, contiguous act coverage, and (when a known template
 * is in play) climax placement near its expected beat position.
 */
function codeCheckIssues(
  outline: BookOutline,
  chapterCount: number,
  acts: StructurePlan["acts"],
  template: PlotTemplate | undefined,
): string[] {
  const issues: string[] = [];
  if (outline.chapters.length !== chapterCount) {
    issues.push(
      `Outline has ${outline.chapters.length} chapters; exactly ${chapterCount} are required.`,
    );
  }
  if (!outline.chapters.every((c, i) => c.number === i + 1)) {
    issues.push(`Chapter numbers must run 1..${chapterCount} in order, no gaps or duplicates.`);
  }
  const sorted = [...acts].sort((a, b) => a.startChapter - b.startChapter);
  let cursor = 1;
  let contiguous = sorted.length > 0;
  for (const act of sorted) {
    if (act.startChapter !== cursor || act.endChapter < act.startChapter) {
      contiguous = false;
      break;
    }
    cursor = act.endChapter + 1;
  }
  if (!contiguous || cursor !== chapterCount + 1) {
    issues.push(`Act boundaries must cover chapters 1..${chapterCount} contiguously.`);
  }
  if (template && chapterCount >= 5) {
    const climaxBeats = template.beats.filter((b) => b.typicalEmotionalArc === "climax");
    const finale = climaxBeats[climaxBeats.length - 1];
    if (finale) {
      const expected = Math.min(
        chapterCount,
        Math.max(1, Math.round(finale.percentageThroughStory * chapterCount)),
      );
      const near = outline.chapters.some(
        (c) => c.emotionalArc === "climax" && Math.abs(c.number - expected) <= 2,
      );
      if (!near) {
        issues.push(
          `"${finale.name}" (${template.name}) belongs near chapter ${expected}, but no chapter within 2 of it has emotionalArc "climax".`,
        );
      }
    }
  }
  return issues;
}

function selfCheckPrompt(
  outline: BookOutline,
  chapterCount: number,
  template: PlotTemplate | undefined,
  issues: string[],
): string {
  const summary = template ? getTemplateSummary(template.structureType) : undefined;
  const beatsSection = summary
    ? `## ${summary.name} beat positions (fraction of the story where each beat belongs)\n${JSON.stringify(
        summary.beats.map((b) => ({ name: b.name, percentage: b.percentage })),
      )}`
    : "";
  return [
    `Verify and correct this book outline. Return the complete corrected outline in the same schema — every chapter, not only the changed ones.`,
    `## Outline\n${JSON.stringify(outline, null, 2)}`,
    beatsSection,
    issues.length > 0
      ? `## Detected problems (must all be fixed)\n${issues.map((i) => `- ${i}`).join("\n")}`
      : "",
    [
      `## Verify`,
      `- Exactly ${chapterCount} chapters numbered 1..${chapterCount}.`,
      `- Each beat lands in the chapter nearest its percentage of ${chapterCount} chapters, with a matching emotionalArc.`,
      `- Hook chaining: chapter N's closingHook must set up chapter N+1's openingHook; rewrite any hooks that do not chain.`,
    ].join("\n"),
    `Change only what these checks require; keep everything else exactly as written.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function normalizeOutline(outline: BookOutline, structureId: string): BookOutline {
  return {
    ...outline,
    plotStructure: getPlotTemplate(structureId) ? structureId : outline.plotStructure,
    chapters: outline.chapters.map((c, i) => ({ ...c, number: i + 1 })),
  };
}

export async function generateOutline(input: OutlineInput): Promise<BookOutline> {
  const model = MODELS[input.tier].outline;
  // Byte-identical across all outline calls in a run — call 1 writes the
  // Anthropic cache prefix, calls 2 and 3 read it.
  const system = anthropicCachedSystem(OUTLINE_SYSTEM_PROMPT);

  const planResult = await metered(
    input.meter,
    { role: "outliner", operation: "outliner.plan", model },
    () =>
      generateText({
        model,
        instructions: system,
        prompt: structurePlanPrompt(input),
        output: Output.object({ schema: structurePlanSchema }),
        providerOptions: gatewayOptions(input.meter, "outliner"),
      }),
  );
  const plan = planResult.output;
  const structureId = resolveStructureId(plan.plotStructure, input.plotStructure);
  const template = getPlotTemplate(structureId);

  const outlineResult = await metered(
    input.meter,
    { role: "outliner", operation: "outliner.outline", model },
    () =>
      generateText({
        model,
        instructions: system,
        prompt: outlinePrompt(input, plan, structureId),
        output: Output.object({ schema: bookOutlineSchema }),
        providerOptions: gatewayOptions(input.meter, "outliner"),
      }),
  );
  let outline = outlineResult.output;

  if (input.tier !== "draft") {
    const issues = codeCheckIssues(outline, input.chapterCount, plan.acts, template);
    // Cheap code checks first; the LLM pass only runs for premium and only
    // when the checks found something it needs to fix.
    if (issues.length > 0 && input.tier === "premium") {
      const checked = await metered(
        input.meter,
        { role: "outliner", operation: "outliner.selfCheck", model },
        () =>
          generateText({
            model,
            instructions: system,
            prompt: selfCheckPrompt(outline, input.chapterCount, template, issues),
            output: Output.object({ schema: bookOutlineSchema }),
            providerOptions: gatewayOptions(input.meter, "outliner"),
          }),
      );
      outline = checked.output;
    }
  }

  return normalizeOutline(outline, structureId);
}

/**
 * Inserts a new outlines version (prior max + 1, source "ai") and upserts a
 * planned chapters row per outline chapter, updating only title/summary on
 * conflict so existing drafts keep their content and status.
 */
export async function persistOutline(
  bookId: string,
  outline: BookOutline,
): Promise<{ outlineId: string; version: number }> {
  const db = getDb();
  const [prior] = await db
    .select({ version: schema.outlines.version })
    .from(schema.outlines)
    .where(eq(schema.outlines.bookId, bookId))
    .orderBy(desc(schema.outlines.version))
    .limit(1);
  const version = (prior?.version ?? 0) + 1;

  const [row] = await db
    .insert(schema.outlines)
    .values({ bookId, version, content: outline, source: "ai" })
    .returning({ id: schema.outlines.id });

  if (outline.chapters.length > 0) {
    await db
      .insert(schema.chapters)
      .values(
        outline.chapters.map((c) => ({
          bookId,
          chapterNumber: c.number,
          title: c.title,
          summary: c.summary,
          status: "planned" as const,
        })),
      )
      .onConflictDoUpdate({
        target: [schema.chapters.bookId, schema.chapters.chapterNumber],
        set: {
          title: sql`excluded.title`,
          summary: sql`excluded.summary`,
          updatedAt: new Date(),
        },
      });
  }

  return { outlineId: row.id, version };
}
