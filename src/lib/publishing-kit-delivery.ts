import { and, eq, sql } from "drizzle-orm";

import { schema, withDbTransaction, type DbTransaction } from "@/db";
import { lockProjectAuthoring } from "@/db/transaction-operations";
import { optionalDeliveryReceiptRef } from "@/lib/billing/optional-delivery";
import {
  readPublishingKit,
  type BookMatterDraftField,
  type PublishingKit,
} from "@/lib/book-package";

export const PUBLISHING_KIT_RECEIPT_TOOL_ID = "publishing.kit";
export const MATTER_DRAFT_RECEIPT_TOOL_ID = "publishing.matter-draft";

/**
 * Which paid publishing output a request is asking for. Both kinds share the
 * delivery contract; only the kit is persisted into the book's matter, because
 * a drafted page belongs to the author until they accept it.
 */
export type PublishingDeliveryTarget =
  { kind: "kit" } | { kind: "matter"; field: BookMatterDraftField };

export type PublishingDelivery =
  | { kind: "kit"; kit: Partial<PublishingKit>; replayed: boolean }
  | { kind: "matter"; field: BookMatterDraftField; text: string; replayed: boolean };

function toolId(target: PublishingDeliveryTarget): string {
  return target.kind === "kit" ? PUBLISHING_KIT_RECEIPT_TOOL_ID : MATTER_DRAFT_RECEIPT_TOOL_ID;
}

export function publishingDeliveryReceiptRef(input: {
  projectId: string;
  target: PublishingDeliveryTarget;
  operationKey: string;
}): string {
  return optionalDeliveryReceiptRef({
    projectId: input.projectId,
    resource: input.target.kind === "kit" ? "publishing-kit" : `matter-draft:${input.target.field}`,
    operationKey: input.operationKey,
  });
}

/**
 * The same idempotency key may legitimately be reused for a kit and for a page
 * draft, so the metering scope carries the target too. Without it, one action's
 * lease release could resolve the other's.
 */
export function publishingMeteringIdempotencyKey(input: {
  projectId: string;
  target: PublishingDeliveryTarget;
  operationKey: string;
}): string {
  const scope =
    input.target.kind === "kit" ? "publishing-kit" : `matter-draft:${input.target.field}`;
  return `project:${input.projectId}:${scope}:${input.operationKey}`;
}

async function recordPublishingDeliveryReceipt(
  tx: DbTransaction,
  input: { userId: string; projectId: string; deliveryReceiptRef: string },
): Promise<"created" | "existing"> {
  const [created] = await tx
    .insert(schema.creditLedger)
    .values({
      userId: input.userId,
      amount: "0",
      kind: "adjustment",
      description: "Durable publishing-copy delivery receipt",
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
    throw new Error("Publishing-copy delivery receipt conflicts with another ledger entry");
  }
  return "existing";
}

function parseReceiptOutput(
  target: PublishingDeliveryTarget,
  value: unknown,
): PublishingDelivery | null {
  if (!value || typeof value !== "object") return null;
  const output = value as Record<string, unknown>;
  if (target.kind === "kit") {
    const kit = readPublishingKit(output.kit);
    return kit ? { kind: "kit", kit, replayed: true } : null;
  }
  const text = typeof output.text === "string" ? output.text.trim() : "";
  return text ? { kind: "matter", field: target.field, text, replayed: true } : null;
}

async function findDeliveredReceipt(
  tx: DbTransaction,
  input: {
    userId: string;
    projectId: string;
    target: PublishingDeliveryTarget;
    operationKey: string;
  },
): Promise<PublishingDelivery | null> {
  const [receipt] = await tx
    .select({ output: schema.contentToolRuns.output })
    .from(schema.contentToolRuns)
    .where(
      and(
        eq(schema.contentToolRuns.userId, input.userId),
        eq(schema.contentToolRuns.projectId, input.projectId),
        sql`${schema.contentToolRuns.chapterId} is null`,
        eq(schema.contentToolRuns.toolId, toolId(input.target)),
        sql`${schema.contentToolRuns.input}->>'operationKey' = ${input.operationKey}`,
        input.target.kind === "matter"
          ? sql`${schema.contentToolRuns.input}->>'field' = ${input.target.field}`
          : sql`true`,
      ),
    )
    .limit(1);
  return receipt ? parseReceiptOutput(input.target, receipt.output) : null;
}

/** The immutable replay path: the delivered output, never a second model call. */
export async function findPublishingDelivery(input: {
  userId: string;
  projectId: string;
  target: PublishingDeliveryTarget;
  operationKey: string;
}): Promise<PublishingDelivery | null> {
  return withDbTransaction(async (tx) => {
    await lockProjectAuthoring(tx, input.projectId);
    const delivered = await findDeliveredReceipt(tx, input);
    if (!delivered) return null;
    await recordPublishingDeliveryReceipt(tx, {
      userId: input.userId,
      projectId: input.projectId,
      deliveryReceiptRef: publishingDeliveryReceiptRef(input),
    });
    return delivered;
  });
}

/**
 * Commits the paid output, its replay receipt, and the optional-operation lease
 * releases together. The kit is merged into books.front_matter in the same
 * transaction; a drafted matter page is only recorded, so a lost response can
 * be replayed without ever overwriting the author's own words.
 */
export async function persistPublishingDelivery(input: {
  userId: string;
  projectId: string;
  bookId: string;
  target: PublishingDeliveryTarget;
  operationKey: string;
  /** Present for a kit delivery. */
  kit?: PublishingKit;
  /** Present for a matter-page delivery. */
  text?: string;
  meteredUsd: number;
  optionalLeaseRefs: string[];
}): Promise<PublishingDelivery> {
  return withDbTransaction(async (tx) => {
    await lockProjectAuthoring(tx, input.projectId);
    const deliveryReceiptRef = publishingDeliveryReceiptRef(input);

    const [book] = await tx
      .select({ id: schema.books.id, frontMatter: schema.books.frontMatter })
      .from(schema.books)
      .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
      .where(
        and(
          eq(schema.books.id, input.bookId),
          eq(schema.books.projectId, input.projectId),
          eq(schema.projects.userId, input.userId),
        ),
      )
      .limit(1);
    if (!book) throw new Error("Book ownership changed before publishing delivery");

    const alreadyDelivered = await findDeliveredReceipt(tx, input);
    if (alreadyDelivered) {
      await recordPublishingDeliveryReceipt(tx, {
        userId: input.userId,
        projectId: input.projectId,
        deliveryReceiptRef,
      });
      await releaseLeases(tx, input);
      return alreadyDelivered;
    }

    const receipt = await recordPublishingDeliveryReceipt(tx, {
      userId: input.userId,
      projectId: input.projectId,
      deliveryReceiptRef,
    });
    if (receipt === "existing") {
      throw new Error("Publishing-copy delivery receipt exists without its immutable output");
    }

    let delivered: PublishingDelivery;
    if (input.target.kind === "kit") {
      const kit = readPublishingKit(input.kit);
      if (!kit) throw new Error("Publishing kit delivery has no usable copy to store");
      // Merge, never replace: cover metadata and every author-owned page in
      // this JSON column must survive a kit refresh.
      await tx
        .update(schema.books)
        .set({
          frontMatter: { ...(book.frontMatter as Record<string, unknown>), publishingKit: kit },
          updatedAt: new Date(),
        })
        .where(eq(schema.books.id, book.id));
      delivered = { kind: "kit", kit, replayed: false };
    } else {
      const text = input.text?.trim();
      if (!text) throw new Error("Matter draft delivery has no text to return");
      delivered = { kind: "matter", field: input.target.field, text, replayed: false };
    }

    await tx.insert(schema.contentToolRuns).values({
      userId: input.userId,
      projectId: input.projectId,
      chapterId: null,
      toolId: toolId(input.target),
      input: {
        operationKey: input.operationKey,
        deliveryReceiptRef,
        ...(input.target.kind === "matter" ? { field: input.target.field } : {}),
      },
      output:
        delivered.kind === "kit"
          ? { kit: delivered.kit }
          : { field: delivered.field, text: delivered.text },
      usd: input.meteredUsd.toFixed(6),
    });
    await releaseLeases(tx, input);

    return delivered;
  });
}

async function releaseLeases(
  tx: DbTransaction,
  input: { userId: string; projectId: string; optionalLeaseRefs: string[] },
): Promise<void> {
  const leaseRefs = [
    ...new Set(
      input.optionalLeaseRefs.filter((ref) => ref.startsWith("optional-operation-lease:")),
    ),
  ];
  if (leaseRefs.length === 0) return;
  await tx
    .insert(schema.creditLedger)
    .values(
      leaseRefs.map((ref) => ({
        userId: input.userId,
        amount: "0",
        kind: "adjustment" as const,
        description: "Release optional publishing copy after durable delivery",
        projectId: input.projectId,
        runId: null,
        externalRef: `release:${ref}`,
      })),
    )
    .onConflictDoNothing();
}
