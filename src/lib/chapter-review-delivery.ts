import { and, eq, sql } from "drizzle-orm";

import { schema, type DbTransaction, withDbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { optionalDeliveryReceiptRef } from "@/lib/billing/optional-delivery";

export const CHAPTER_REVIEW_RECEIPT_TOOL_ID = "chapter.review";

type SuggestionInsert = typeof schema.suggestions.$inferInsert;
type SuggestionRow = typeof schema.suggestions.$inferSelect;

type ReviewReceiptOutput = {
  suggestionIds: string[];
  skipped: number;
};

export type ChapterReviewDelivery = {
  suggestions: SuggestionRow[];
  skipped: number;
  replayed: boolean;
};

export function chapterReviewDeliveryReceiptRef(input: {
  projectId: string;
  chapterId: string;
  operationKey: string;
}): string {
  return optionalDeliveryReceiptRef({
    projectId: input.projectId,
    resource: `chapter-review:${input.chapterId}`,
    operationKey: input.operationKey,
  });
}

async function recordChapterReviewDeliveryReceipt(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    deliveryReceiptRef: string;
  },
): Promise<"created" | "existing"> {
  const [created] = await tx
    .insert(schema.creditLedger)
    .values({
      userId: input.userId,
      amount: "0",
      kind: "adjustment",
      description: "Durable chapter-review delivery receipt",
      projectId: input.projectId,
      runId: null,
      externalRef: input.deliveryReceiptRef,
    })
    .onConflictDoNothing()
    .returning({ id: schema.creditLedger.id });
  if (created) return "created";

  const [existing] = await tx
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, input.userId),
        eq(schema.creditLedger.projectId, input.projectId),
        sql`${schema.creditLedger.runId} is null`,
        eq(schema.creditLedger.kind, "adjustment"),
        eq(schema.creditLedger.amount, "0"),
        eq(schema.creditLedger.externalRef, input.deliveryReceiptRef),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error("Chapter-review delivery receipt conflicts with another ledger entry");
  }
  return "existing";
}

function parseReceiptOutput(value: unknown): ReviewReceiptOutput {
  if (!value || typeof value !== "object") return { suggestionIds: [], skipped: 0 };
  const output = value as Record<string, unknown>;
  return {
    suggestionIds: Array.isArray(output.suggestionIds)
      ? output.suggestionIds.filter((id): id is string => typeof id === "string")
      : [],
    skipped:
      typeof output.skipped === "number" && Number.isSafeInteger(output.skipped)
        ? Math.max(0, output.skipped)
        : 0,
  };
}

export async function findChapterReviewDelivery(input: {
  userId: string;
  projectId: string;
  chapterId: string;
  operationKey: string;
}): Promise<ChapterReviewDelivery | null> {
  return withDbTransaction(async (tx) => {
    await lockProjectAuthoring(tx, input.projectId);
    const [receipt] = await tx
      .select({ output: schema.contentToolRuns.output })
      .from(schema.contentToolRuns)
      .where(
        and(
          eq(schema.contentToolRuns.userId, input.userId),
          eq(schema.contentToolRuns.projectId, input.projectId),
          eq(schema.contentToolRuns.chapterId, input.chapterId),
          eq(schema.contentToolRuns.toolId, CHAPTER_REVIEW_RECEIPT_TOOL_ID),
          sql`${schema.contentToolRuns.input}->>'operationKey' = ${input.operationKey}`,
        ),
      )
      .limit(1);
    const deliveryReceiptRef = chapterReviewDeliveryReceiptRef(input);
    if (!receipt) {
      const legacySuggestions = await tx
        .select()
        .from(schema.suggestions)
        .where(
          and(
            eq(schema.suggestions.chapterId, input.chapterId),
            eq(schema.suggestions.passType, "review"),
            sql`${schema.suggestions.anchor}->>'operationKey' = ${input.operationKey}`,
          ),
        );
      if (legacySuggestions.length === 0) return null;

      await recordChapterReviewDeliveryReceipt(tx, {
        userId: input.userId,
        projectId: input.projectId,
        deliveryReceiptRef,
      });
      await tx.insert(schema.contentToolRuns).values({
        userId: input.userId,
        projectId: input.projectId,
        chapterId: input.chapterId,
        toolId: CHAPTER_REVIEW_RECEIPT_TOOL_ID,
        input: {
          operationKey: input.operationKey,
          deliveryReceiptRef,
          promotedFromLegacySuggestions: true,
        },
        output: {
          suggestionIds: legacySuggestions.map((suggestion) => suggestion.id),
          skipped: 0,
        } satisfies ReviewReceiptOutput,
        usd: "0",
      });
      return { suggestions: legacySuggestions, skipped: 0, replayed: true };
    }

    await recordChapterReviewDeliveryReceipt(tx, {
      userId: input.userId,
      projectId: input.projectId,
      deliveryReceiptRef,
    });
    const output = parseReceiptOutput(receipt.output);
    const suggestions =
      output.suggestionIds.length === 0
        ? []
        : await tx
            .select()
            .from(schema.suggestions)
            .where(
              and(
                eq(schema.suggestions.chapterId, input.chapterId),
                eq(schema.suggestions.passType, "review"),
                sql`${schema.suggestions.anchor}->>'operationKey' = ${input.operationKey}`,
              ),
            );
    return { suggestions, skipped: output.skipped, replayed: true };
  });
}

/**
 * Commits the review result, its replay receipt, and optional-operation lease
 * releases together. A valid empty review is still durable, and a lost COMMIT
 * acknowledgement can be verified without guessing whether to refund.
 */
export async function persistChapterReviewDelivery(input: {
  userId: string;
  projectId: string;
  chapterId: string;
  operationKey: string;
  suggestions: SuggestionInsert[];
  skipped: number;
  meteredUsd: number;
  optionalLeaseRefs: string[];
}): Promise<ChapterReviewDelivery> {
  return withDbTransaction(async (tx) => {
    await lockProjectAuthoring(tx, input.projectId);
    const deliveryReceiptRef = chapterReviewDeliveryReceiptRef(input);

    const [ownedChapter] = await tx
      .select({ id: schema.chapters.id })
      .from(schema.chapters)
      .innerJoin(schema.books, eq(schema.books.id, schema.chapters.bookId))
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .where(
        and(
          eq(schema.chapters.id, input.chapterId),
          eq(schema.books.projectId, input.projectId),
          eq(schema.projects.userId, input.userId),
        ),
      )
      .limit(1);
    if (!ownedChapter) throw new Error("Chapter review ownership changed before delivery");

    const [existingReceipt] = await tx
      .select({ output: schema.contentToolRuns.output })
      .from(schema.contentToolRuns)
      .where(
        and(
          eq(schema.contentToolRuns.userId, input.userId),
          eq(schema.contentToolRuns.projectId, input.projectId),
          eq(schema.contentToolRuns.chapterId, input.chapterId),
          eq(schema.contentToolRuns.toolId, CHAPTER_REVIEW_RECEIPT_TOOL_ID),
          sql`${schema.contentToolRuns.input}->>'operationKey' = ${input.operationKey}`,
        ),
      )
      .limit(1);

    let rows: SuggestionRow[];
    let skipped: number;
    let replayed: boolean;
    if (existingReceipt) {
      await recordChapterReviewDeliveryReceipt(tx, {
        userId: input.userId,
        projectId: input.projectId,
        deliveryReceiptRef,
      });
      const output = parseReceiptOutput(existingReceipt.output);
      rows =
        output.suggestionIds.length === 0
          ? []
          : await tx
              .select()
              .from(schema.suggestions)
              .where(
                and(
                  eq(schema.suggestions.chapterId, input.chapterId),
                  eq(schema.suggestions.passType, "review"),
                  sql`${schema.suggestions.anchor}->>'operationKey' = ${input.operationKey}`,
                ),
              );
      skipped = output.skipped;
      replayed = true;
    } else {
      const receipt = await recordChapterReviewDeliveryReceipt(tx, {
        userId: input.userId,
        projectId: input.projectId,
        deliveryReceiptRef,
      });
      if (receipt === "existing") {
        throw new Error("Chapter-review delivery receipt exists without its immutable output");
      }
      rows =
        input.suggestions.length === 0
          ? []
          : await tx.insert(schema.suggestions).values(input.suggestions).returning();
      skipped = input.skipped;
      replayed = false;
      await tx.insert(schema.contentToolRuns).values({
        userId: input.userId,
        projectId: input.projectId,
        chapterId: input.chapterId,
        toolId: CHAPTER_REVIEW_RECEIPT_TOOL_ID,
        input: { operationKey: input.operationKey, deliveryReceiptRef },
        output: {
          suggestionIds: rows.map((row) => row.id),
          skipped,
        } satisfies ReviewReceiptOutput,
        usd: input.meteredUsd.toFixed(6),
      });
    }

    const leaseRefs = [
      ...new Set(
        input.optionalLeaseRefs.filter((ref) => ref.startsWith("optional-operation-lease:")),
      ),
    ];
    if (leaseRefs.length > 0) {
      await tx
        .insert(schema.creditLedger)
        .values(
          leaseRefs.map((ref) => ({
            userId: input.userId,
            amount: "0",
            kind: "adjustment" as const,
            description: "Release optional chapter review after durable delivery",
            projectId: input.projectId,
            runId: null,
            externalRef: `release:${ref}`,
          })),
        )
        .onConflictDoNothing();
    }
    return { suggestions: rows, skipped, replayed };
  });
}
