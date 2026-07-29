import { generateText, Output } from "ai";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { anthropicCachedSystem } from "@/ai/cache";
import { gatewayOptions, metered } from "@/ai/metering";
import { MODELS, type QualityTier } from "@/ai/models";
import { EDITOR_SYSTEM_PROMPT } from "@/ai/prompts/editor";
import { selectionEditSchema } from "@/ai/schemas";
import { getDb, schema } from "@/db";
import { getChapterById, getChapterOwnership } from "@/db/queries/books";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { assertCreditsForUsd, InsufficientCreditsError } from "@/lib/billing/credits";
import { contextWindow } from "@/lib/editor/anchors";
import { toSuggestionDTO } from "@/lib/editor/types";

export const maxDuration = 60;

const bodySchema = z.object({
  selection: z
    .object({
      start: z.number().int().min(0),
      end: z.number().int().min(1),
      text: z.string().min(1).max(20_000),
    })
    .refine((s) => s.end > s.start, { message: "end must be greater than start" }),
  instruction: z.string().min(1).max(2_000),
});

/** Selections shorter than this go to the cheap line-edit model. */
const LINE_EDIT_MAX_CHARS = 2_000;

function selectionPrompt(input: {
  instruction: string;
  before: string;
  selected: string;
  after: string;
}): string {
  return [
    `A fiction author selected a passage in their chapter and asked for a targeted revision. Rewrite ONLY the selected passage.`,
    `## Author's instruction\n${input.instruction}`,
    input.before
      ? `## Passage before the selection (context — do not rewrite)\n${input.before}`
      : "",
    `## Selected passage (rewrite this)\n${input.selected}`,
    input.after ? `## Passage after the selection (context — do not rewrite)\n${input.after}` : "",
    [
      `## Output rules`,
      `"replacement" must be a drop-in substitute for the selected passage: same tense, POV, and voice as the surrounding prose, valid markdown, and it must splice cleanly between the context passages (preserve leading/trailing punctuation and spacing implied by the context).`,
      `Keep roughly the same length unless the instruction says otherwise. Give a one-line "rationale".`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function POST(req: Request, ctx: { params: Promise<{ chapterId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  const { chapterId } = await ctx.params;
  if (!z.uuid().safeParse(chapterId).success) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { selection, instruction } = parsed.data;

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  const chapter = await getChapterById(chapterId);
  if (!chapter) return Response.json({ error: "Chapter not found" }, { status: 404 });

  if (chapter.content.slice(selection.start, selection.end) !== selection.text) {
    return Response.json(
      { error: "Selection no longer matches the saved chapter", currentVersion: chapter.version },
      { status: 409 },
    );
  }

  const db = getDb();
  const [project] = await db
    .select({ settings: schema.projects.settings })
    .from(schema.projects)
    .where(eq(schema.projects.id, ownership.projectId))
    .limit(1);
  const tier: QualityTier = project?.settings.qualityTier ?? "standard";

  const model =
    selection.text.length < LINE_EDIT_MAX_CHARS ? MODELS[tier].lineEdit : MODELS[tier].editor;
  const { before, after } = contextWindow(chapter.content, selection.start, selection.end);
  const meter = { userId, projectId: ownership.projectId };

  let output: z.infer<typeof selectionEditSchema>;
  try {
    // Pre-gate: a selection edit meters ~$0.01-0.05; refuse before the call
    // rather than letting metered() spend into the floor.
    await assertCreditsForUsd(userId, 0.05);
    const result = await metered(
      meter,
      { role: "editor", operation: "editor.selection", model },
      () =>
        generateText({
          model,
          instructions: anthropicCachedSystem(EDITOR_SYSTEM_PROMPT),
          prompt: selectionPrompt({ instruction, before, selected: selection.text, after }),
          output: Output.object({ schema: selectionEditSchema }),
          providerOptions: gatewayOptions(meter, "editor"),
        }),
    );
    output = result.output;
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: error.message }, { status: 402 });
    }
    throw error;
  }

  // Ordinal of this passage among identical matches (0 = first), so the
  // client can highlight/apply the right duplicate. Counts match starts
  // before the selection in the full content, mirroring findTextRange's
  // every-start enumeration.
  let occurrence = 0;
  for (
    let idx = chapter.content.indexOf(selection.text);
    idx !== -1 && idx < selection.start;
    idx = chapter.content.indexOf(selection.text, idx + 1)
  ) {
    occurrence += 1;
  }

  const [row] = await db
    .insert(schema.suggestions)
    .values({
      chapterId,
      chapterVersion: chapter.version,
      passType: "selection",
      suggestionType: "selection",
      severity: "info",
      anchor: {
        start: selection.start,
        end: selection.end,
        originalText: selection.text,
        occurrence,
      },
      suggestedText: output.replacement,
      explanation: output.rationale,
      status: "pending",
    })
    .returning();

  return Response.json({ suggestion: toSuggestionDTO(row) }, { status: 201 });
}
