import { createHash } from "node:crypto";

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { creativeQuestionSchema, type CreativeQuestion } from "@/ai/schemas";
import { getDb, schema, withDbTransaction } from "@/db";
import type { GenerationConfig, CreativeDecision } from "@/lib/run-events";

export const CREATIVE_QUESTION_KEY = "after_concept" as const;

export const creativeDecisionPayloadSchema = z
  .object({
    questionId: z.uuid(),
    decisionDigest: z.string().regex(/^[a-f0-9]{64}$/),
    mode: z.enum(["option", "custom", "sopher"]),
    selectedOptionId: z.enum(["option-1", "option-2", "option-3"]).optional(),
    customResponse: z.string().trim().min(1).max(2_000).optional(),
  })
  .superRefine((decision, ctx) => {
    if (decision.mode === "option" && !decision.selectedOptionId) {
      ctx.addIssue({
        code: "custom",
        path: ["selectedOptionId"],
        message: "Choose one of the three story directions",
      });
    }
    if (decision.mode === "custom" && !decision.customResponse) {
      ctx.addIssue({
        code: "custom",
        path: ["customResponse"],
        message: "Write the direction you want Sopher to follow",
      });
    }
    if (decision.mode !== "option" && decision.selectedOptionId) {
      ctx.addIssue({
        code: "custom",
        path: ["selectedOptionId"],
        message: "This response cannot also select a suggested direction",
      });
    }
    if (decision.mode !== "custom" && decision.customResponse) {
      ctx.addIssue({
        code: "custom",
        path: ["customResponse"],
        message: "This response cannot also include a custom direction",
      });
    }
  });

export type CreativeDecisionPayload = z.infer<typeof creativeDecisionPayloadSchema>;

export type CreativeQuestionForAuthor = CreativeQuestion & {
  id: string;
  questionKey: typeof CREATIVE_QUESTION_KEY;
  decisionDigest: string;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function creativeQuestionDigest(question: CreativeQuestion): string {
  return createHash("sha256").update(canonicalJson(question)).digest("hex");
}

function questionForAuthor(row: {
  id: string;
  questionKey: string;
  prompt: string;
  rationale: string | null;
  options: unknown;
  recommendedOptionId: string;
  decisionDigest: string;
}): CreativeQuestionForAuthor | null {
  const parsed = creativeQuestionSchema.safeParse({
    question: row.prompt,
    rationale: row.rationale ?? "Choose the direction that feels most like your story.",
    options: row.options,
    recommendedOptionId: row.recommendedOptionId,
  });
  if (!parsed.success || row.questionKey !== CREATIVE_QUESTION_KEY) return null;
  return {
    id: row.id,
    questionKey: CREATIVE_QUESTION_KEY,
    decisionDigest: row.decisionDigest,
    ...parsed.data,
  };
}

export async function readPendingCreativeQuestion(
  runId: string,
): Promise<CreativeQuestionForAuthor | null> {
  const [row] = await getDb()
    .select({
      id: schema.authoringQuestions.id,
      questionKey: schema.authoringQuestions.questionKey,
      prompt: schema.authoringQuestions.prompt,
      rationale: schema.authoringQuestions.rationale,
      options: schema.authoringQuestions.options,
      recommendedOptionId: schema.authoringQuestions.recommendedOptionId,
      decisionDigest: schema.authoringQuestions.decisionDigest,
    })
    .from(schema.authoringQuestions)
    .where(
      and(
        eq(schema.authoringQuestions.runId, runId),
        eq(schema.authoringQuestions.status, "pending"),
      ),
    )
    .limit(1);
  return row ? questionForAuthor(row) : null;
}

export async function persistCreativeQuestion(input: {
  runId: string;
  projectId: string;
  question: CreativeQuestion;
}): Promise<CreativeQuestionForAuthor> {
  const question = creativeQuestionSchema.parse(input.question);
  const decisionDigest = creativeQuestionDigest(question);
  await getDb()
    .insert(schema.authoringQuestions)
    .values({
      runId: input.runId,
      projectId: input.projectId,
      questionKey: CREATIVE_QUESTION_KEY,
      stage: CREATIVE_QUESTION_KEY,
      prompt: question.question,
      rationale: question.rationale,
      options: question.options,
      recommendedOptionId: question.recommendedOptionId,
      decisionDigest,
    })
    .onConflictDoNothing();

  const [stored] = await getDb()
    .select({
      id: schema.authoringQuestions.id,
      questionKey: schema.authoringQuestions.questionKey,
      prompt: schema.authoringQuestions.prompt,
      rationale: schema.authoringQuestions.rationale,
      options: schema.authoringQuestions.options,
      recommendedOptionId: schema.authoringQuestions.recommendedOptionId,
      decisionDigest: schema.authoringQuestions.decisionDigest,
    })
    .from(schema.authoringQuestions)
    .where(
      and(
        eq(schema.authoringQuestions.runId, input.runId),
        eq(schema.authoringQuestions.questionKey, CREATIVE_QUESTION_KEY),
      ),
    )
    .limit(1);
  const result = stored ? questionForAuthor(stored) : null;
  if (!result) throw new Error("Creative direction question could not be persisted");
  return result;
}

/** Registers the question and Workflow pause as one actionable boundary. */
export async function markCreativeQuestionPauseRegistered(input: {
  runId: string;
  projectId: string;
  userId: string;
  questionId: string;
  pauseVersion: number;
}): Promise<boolean> {
  return withDbTransaction(async (tx) => {
    const [question] = await tx
      .update(schema.authoringQuestions)
      .set({ pauseVersion: input.pauseVersion })
      .where(
        and(
          eq(schema.authoringQuestions.id, input.questionId),
          eq(schema.authoringQuestions.runId, input.runId),
          eq(schema.authoringQuestions.projectId, input.projectId),
          eq(schema.authoringQuestions.status, "pending"),
          or(
            isNull(schema.authoringQuestions.pauseVersion),
            eq(schema.authoringQuestions.pauseVersion, input.pauseVersion),
          ),
        ),
      )
      .returning({ id: schema.authoringQuestions.id });
    if (!question) return false;

    const now = new Date();
    const [run] = await tx
      .update(schema.generationRuns)
      .set({
        status: "awaiting_input",
        pauseRegisteredAt: now,
        heartbeatAt: now,
      })
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          eq(schema.generationRuns.projectId, input.projectId),
          eq(schema.generationRuns.userId, input.userId),
          eq(schema.generationRuns.pauseKind, "creative_decision"),
          eq(schema.generationRuns.pauseVersion, input.pauseVersion),
          isNull(schema.generationRuns.cancellationRequestedAt),
          sql`${schema.generationRuns.status} in ('queued', 'running', 'awaiting_input')`,
        ),
      )
      .returning({ id: schema.generationRuns.id });
    if (!run) throw new Error("Generation run is no longer active");
    return true;
  });
}

/**
 * Consumes an accepted answer, records the auditable decision, and updates the
 * frozen generation configuration in one transaction.
 */
export async function consumeCreativeDecision(input: {
  runId: string;
  projectId: string;
  userId: string;
  pauseVersion: number;
  inputId: string;
}): Promise<CreativeDecision | null> {
  return withDbTransaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(
        hashtextextended('sopher:authoring-input:' || ${input.runId}, 0)
      )`,
    );
    const [run] = await tx
      .select({
        config: schema.generationRuns.config,
        status: schema.generationRuns.status,
        pauseKind: schema.generationRuns.pauseKind,
        pauseVersion: schema.generationRuns.pauseVersion,
        cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
      })
      .from(schema.generationRuns)
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          eq(schema.generationRuns.projectId, input.projectId),
          eq(schema.generationRuns.userId, input.userId),
        ),
      )
      .limit(1);
    if (
      !run ||
      run.cancellationRequestedAt ||
      run.status !== "awaiting_input" ||
      run.pauseKind !== "creative_decision" ||
      run.pauseVersion !== input.pauseVersion
    ) {
      return null;
    }

    const [durableInput] = await tx
      .select()
      .from(schema.authoringRunInputs)
      .where(
        and(
          eq(schema.authoringRunInputs.id, input.inputId),
          eq(schema.authoringRunInputs.runId, input.runId),
          eq(schema.authoringRunInputs.kind, "creative_decision"),
          eq(schema.authoringRunInputs.pauseVersion, input.pauseVersion),
        ),
      )
      .limit(1);
    if (!durableInput) return null;
    const payload = creativeDecisionPayloadSchema.parse(durableInput.payload);

    const [question] = await tx
      .select()
      .from(schema.authoringQuestions)
      .where(
        and(
          eq(schema.authoringQuestions.id, payload.questionId),
          eq(schema.authoringQuestions.runId, input.runId),
          eq(schema.authoringQuestions.projectId, input.projectId),
          eq(schema.authoringQuestions.pauseVersion, input.pauseVersion),
        ),
      )
      .limit(1);
    if (!question || question.decisionDigest !== payload.decisionDigest) return null;

    const existing = question.decision as CreativeDecision | null;
    if (question.status === "answered" && existing) return existing;

    const optionId =
      payload.mode === "sopher" ? question.recommendedOptionId : (payload.selectedOptionId ?? null);
    const option = question.options.find((candidate) => candidate.id === optionId);
    const answer =
      payload.mode === "custom"
        ? payload.customResponse!
        : option
          ? `${option.label}: ${option.description}`
          : null;
    if (!answer) return null;

    const decision: CreativeDecision = {
      questionId: question.id,
      questionKey: CREATIVE_QUESTION_KEY,
      mode: payload.mode,
      selectedOptionId: optionId,
      answer,
    };
    const currentConfig = run.config as GenerationConfig;
    const nextConfig: GenerationConfig = {
      ...currentConfig,
      creativeDecisions: {
        ...currentConfig.creativeDecisions,
        afterConcept: decision,
      },
    };

    await tx
      .update(schema.authoringRunInputs)
      .set({ status: "consumed", consumedAt: new Date(), lastDeliveryError: null })
      .where(eq(schema.authoringRunInputs.id, durableInput.id));
    await tx
      .update(schema.authoringQuestions)
      .set({
        status: "answered",
        inputId: durableInput.id,
        decision,
        answeredAt: new Date(),
      })
      .where(eq(schema.authoringQuestions.id, question.id));
    const [updated] = await tx
      .update(schema.generationRuns)
      .set({ config: nextConfig })
      .where(
        and(
          eq(schema.generationRuns.id, input.runId),
          eq(schema.generationRuns.config, currentConfig),
          eq(schema.generationRuns.pauseKind, "creative_decision"),
          eq(schema.generationRuns.pauseVersion, input.pauseVersion),
        ),
      )
      .returning({ id: schema.generationRuns.id });
    if (!updated) throw new Error("Creative direction changed while it was being saved");
    return decision;
  });
}

export function creativeDecisionPrompt(config: Partial<GenerationConfig>): string | undefined {
  const decision = config.creativeDecisions?.afterConcept;
  if (!decision) return undefined;
  return `The author chose this story direction before outlining: ${decision.answer}`;
}
