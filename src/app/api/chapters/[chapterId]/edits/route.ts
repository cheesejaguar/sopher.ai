import { generateText, Output } from "ai";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { anthropicCachedSystem } from "@/ai/cache";
import {
  gatewayOptions,
  healReplayedMeteredDelivery,
  metered,
  meteredCallAuthorizationUsd,
  completeMeteredDelivery,
  refundMeteredDelivery,
  type MeterCtx,
} from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS, type QualityTier } from "@/ai/models";
import { EDITOR_SYSTEM_PROMPT } from "@/ai/prompts/editor";
import { selectionEditSchema } from "@/ai/schemas";
import { getDb, schema } from "@/db";
import { getChapterById, getChapterOwnership } from "@/db/queries/books";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { assertCreditsForUsd, InsufficientCreditsError } from "@/lib/billing/credits";
import { InvalidIdempotencyKeyError, requireIdempotencyKey } from "@/lib/billing/idempotency";
import { contextWindow } from "@/lib/editor/anchors";
import { toSuggestionDTO } from "@/lib/editor/types";
import { authorizeProjectSpend, projectSpendAccessErrorResponse } from "@/lib/project-spend-http";

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

  try {
    await assertNotSuspended(userId);
  } catch (error) {
    if (error instanceof SuspendedError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    throw error;
  }

  const { chapterId } = await ctx.params;
  if (!z.uuid().safeParse(chapterId).success) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }
  let idempotencyKey: string;
  try {
    idempotencyKey = requireIdempotencyKey(req);
  } catch (error) {
    if (error instanceof InvalidIdempotencyKeyError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
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

  const db = getDb();
  const findDeliveredSelection = () =>
    db
      .select()
      .from(schema.suggestions)
      .where(
        and(
          eq(schema.suggestions.chapterId, chapterId),
          eq(schema.suggestions.passType, "selection"),
          sql`${schema.suggestions.anchor}->>'operationKey' = ${idempotencyKey}`,
        ),
      )
      .limit(1);

  // A response can be lost after the suggestion commits. Reuse that exact
  // durable delivery before rate limiting or invoking another paid model call.
  const [replayed] = await findDeliveredSelection();
  if (replayed) {
    await healReplayedMeteredDelivery({
      userId,
      projectId: ownership.projectId,
      idempotencyKey,
    });
    return Response.json({ suggestion: toSuggestionDTO(replayed) }, { status: 201 });
  }

  const spendDenied = await authorizeProjectSpend({
    userId,
    projectId: ownership.projectId,
    operationKind: "optional",
  });
  if (spendDenied) return spendDenied;

  // Bound new paid work only after ruling out a free delivery replay.
  const limited = await rateLimit(LIMITS.llmEdit, req, userId);
  if (limited.limited) return limited.response;

  const chapter = await getChapterById(chapterId);
  if (!chapter) return Response.json({ error: "Chapter not found" }, { status: 404 });

  if (chapter.content.slice(selection.start, selection.end) !== selection.text) {
    return Response.json(
      { error: "Selection no longer matches the saved chapter", currentVersion: chapter.version },
      { status: 409 },
    );
  }

  const [project] = await db
    .select({ settings: schema.projects.settings })
    .from(schema.projects)
    .where(eq(schema.projects.id, ownership.projectId))
    .limit(1);
  const tier: QualityTier = project?.settings.qualityTier ?? "standard";

  const model =
    selection.text.length < LINE_EDIT_MAX_CHARS ? MODELS[tier].lineEdit : MODELS[tier].editor;
  const { before, after } = contextWindow(chapter.content, selection.start, selection.end);
  const meter: MeterCtx = {
    userId,
    projectId: ownership.projectId,
    authorizationUsd: 0.05,
    idempotencyKey: `chapter:${chapterId}:${idempotencyKey}`,
  };
  const callInfo = { role: "editor", operation: "editor.selection", model };

  let output: z.infer<typeof selectionEditSchema>;
  try {
    await assertCreditsForUsd(userId, meteredCallAuthorizationUsd(meter, callInfo));
    const result = await metered(meter, callInfo, () =>
      generateText({
        model,
        instructions: anthropicCachedSystem(EDITOR_SYSTEM_PROMPT),
        prompt: selectionPrompt({ instruction, before, selected: selection.text, after }),
        maxOutputTokens: meteredMaxOutputTokens("editor.selection"),
        prepareStep: meteredInputGuard("editor.selection"),
        output: Output.object({ schema: selectionEditSchema }),
        providerOptions: gatewayOptions(meter, "editor"),
      }),
    );
    output = result.output;
  } catch (error) {
    const spendResponse = projectSpendAccessErrorResponse(error);
    if (spendResponse) return spendResponse;
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

  let row: typeof schema.suggestions.$inferSelect | undefined;
  try {
    [row] = await db
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
          operationKey: idempotencyKey,
        },
        suggestedText: output.replacement,
        explanation: output.rationale,
        // The author's own words. Went into the prompt and was then dropped, so
        // the record held the answer with no trace of the question.
        instruction,
        status: "pending",
      })
      .returning();
  } catch (persistenceError) {
    // A thrown insert can still mean COMMIT succeeded and its acknowledgement
    // was lost. Verify the exact paid operation before deciding to refund.
    try {
      [row] = await findDeliveredSelection();
    } catch (verificationError) {
      throw new AggregateError(
        [persistenceError, verificationError],
        "Selection-edit persistence failed and could not be verified",
      );
    }
    if (!row) {
      await refundMeteredDelivery(meter, "Selection edit could not be saved — refunded");
      return Response.json({ error: "Could not save the suggestion" }, { status: 503 });
    }
  }
  if (!row) {
    await refundMeteredDelivery(meter, "Selection edit could not be saved — refunded");
    return Response.json({ error: "Could not save the suggestion" }, { status: 503 });
  }

  await completeMeteredDelivery(meter);
  return Response.json({ suggestion: toSuggestionDTO(row) }, { status: 201 });
}
