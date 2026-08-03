import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  chapterReviewDeliveryReceiptRef,
  findChapterReviewDelivery,
  persistChapterReviewDelivery,
} from "@/lib/chapter-review-delivery";

function isolatedDatabaseUrl(): string | null {
  const value = process.env.E2E_DATABASE_URL?.trim();
  if (!value && process.env.E2E_DATABASE_ISOLATED !== "1") return null;
  if (!value || process.env.E2E_DATABASE_ISOLATED !== "1") {
    throw new Error("Chapter review tests require E2E_DATABASE_ISOLATED=1 and E2E_DATABASE_URL.");
  }
  const parsed = new URL(value);
  if (
    process.env.NODE_ENV === "production" ||
    !process.env.E2E_DATABASE_HOST ||
    parsed.hostname !== process.env.E2E_DATABASE_HOST
  ) {
    throw new Error("Chapter review tests require the explicitly allowed disposable Neon host.");
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("durable chapter review delivery against isolated Neon", () => {
  const suffix = randomUUID();
  const userId = `e2e-chapter-review-${suffix}`;
  const projectId = randomUUID();
  const bookId = randomUUID();
  const chapterId = randomUUID();
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let observer: ReturnType<typeof neon> | null = null;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Disposable database URL disappeared.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);
    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
    await observer`
      insert into projects (
        id, user_id, title, brief, experience,
        target_chapters, target_words_per_chapter, settings
      )
      values (
        ${projectId}, ${userId}, 'Review receipt fixture',
        'A disposable review fixture.', 'full_book',
        3, 1000, '{}'::jsonb
      )
    `;
    await observer`
      insert into books (id, project_id, title)
      values (${bookId}, ${projectId}, 'Review receipt fixture')
    `;
    await observer`
      insert into chapters (
        id, book_id, chapter_number, title, content, word_count, version, status
      )
      values (
        ${chapterId}, ${bookId}, 1, 'Arrival',
        'The lantern was already burning.', 6, 1, 'drafted'
      )
    `;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("receipts empty and nonempty results and releases their leases atomically", async () => {
    const emptyKey = randomUUID();
    const emptyLease = `optional-operation-lease:fixture:${emptyKey}:attempt:1`;
    await observer!`
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, external_ref
      )
      values (${userId}, 0, 'adjustment', 'Review lease', ${projectId}, ${emptyLease})
    `;

    const empty = await persistChapterReviewDelivery({
      userId,
      projectId,
      chapterId,
      operationKey: emptyKey,
      suggestions: [],
      skipped: 0,
      meteredUsd: 0.012345,
      optionalLeaseRefs: [emptyLease],
    });
    expect(empty).toMatchObject({ suggestions: [], skipped: 0, replayed: false });
    const emptyDeliveryReceipt = chapterReviewDeliveryReceiptRef({
      projectId,
      chapterId,
      operationKey: emptyKey,
    });
    await observer!`
      delete from credit_ledger
      where external_ref = ${emptyDeliveryReceipt}
    `;
    await expect(
      findChapterReviewDelivery({ userId, projectId, chapterId, operationKey: emptyKey }),
    ).resolves.toMatchObject({ suggestions: [], skipped: 0, replayed: true });

    const suggestionKey = randomUUID();
    const suggestionLease = `optional-operation-lease:fixture:${suggestionKey}:attempt:1`;
    await observer!`
      insert into credit_ledger (
        user_id, amount, kind, description, project_id, external_ref
      )
      values (${userId}, 0, 'adjustment', 'Review lease', ${projectId}, ${suggestionLease})
    `;
    const suggestion = {
      chapterId,
      chapterVersion: 1,
      passType: "review" as const,
      suggestionType: "clarity",
      severity: "info" as const,
      anchor: {
        start: 4,
        end: 11,
        originalText: "lantern",
        operationKey: suggestionKey,
      },
      suggestedText: "signal lamp",
      explanation: "Matches the coastal setting.",
      instruction: null,
      status: "pending" as const,
    };
    const stored = await persistChapterReviewDelivery({
      userId,
      projectId,
      chapterId,
      operationKey: suggestionKey,
      suggestions: [suggestion],
      skipped: 2,
      meteredUsd: 0.023456,
      optionalLeaseRefs: [suggestionLease],
    });
    expect(stored).toMatchObject({ skipped: 2, replayed: false });
    expect(stored.suggestions).toHaveLength(1);

    const replayed = await persistChapterReviewDelivery({
      userId,
      projectId,
      chapterId,
      operationKey: suggestionKey,
      suggestions: [{ ...suggestion, suggestedText: "must not replace the receipt" }],
      skipped: 0,
      meteredUsd: 9,
      optionalLeaseRefs: [suggestionLease],
    });
    expect(replayed).toMatchObject({ skipped: 2, replayed: true });
    expect(replayed.suggestions[0]?.suggestedText).toBe("signal lamp");
    const suggestionDeliveryReceipt = chapterReviewDeliveryReceiptRef({
      projectId,
      chapterId,
      operationKey: suggestionKey,
    });
    const legacyKey = randomUUID();
    const legacySuggestionId = randomUUID();
    await observer!`
      insert into suggestions (
        id, chapter_id, chapter_version, pass_type, suggestion_type,
        severity, anchor, suggested_text, explanation, status
      )
      values (
        ${legacySuggestionId}, ${chapterId}, 1, 'review', 'clarity', 'info',
        ${JSON.stringify({
          start: 4,
          end: 11,
          originalText: "lantern",
          operationKey: legacyKey,
        })}::jsonb,
        'beacon', 'Legacy delivered suggestion.', 'pending'
      )
    `;
    await expect(
      findChapterReviewDelivery({
        userId,
        projectId,
        chapterId,
        operationKey: legacyKey,
      }),
    ).resolves.toMatchObject({
      suggestions: [expect.objectContaining({ id: legacySuggestionId })],
      skipped: 0,
      replayed: true,
    });
    const legacyDeliveryReceipt = chapterReviewDeliveryReceiptRef({
      projectId,
      chapterId,
      operationKey: legacyKey,
    });

    const [facts] = (await observer!`
      select
        (
          select count(*)::int
          from content_tool_runs
          where project_id = ${projectId}
            and tool_id = 'chapter.review'
        ) as receipts,
        (
          select count(*)::int
          from suggestions
          where chapter_id = ${chapterId}
        ) as suggestions,
        (
          select count(*)::int
          from credit_ledger
          where external_ref in (${`release:${emptyLease}`}, ${`release:${suggestionLease}`})
        ) as releases,
        (
          select count(*)::int
          from credit_ledger
          where external_ref in (
            ${emptyDeliveryReceipt}, ${suggestionDeliveryReceipt}, ${legacyDeliveryReceipt}
          )
        ) as delivery_receipts
    `) as unknown as Array<{
      receipts: number;
      suggestions: number;
      releases: number;
      delivery_receipts: number;
    }>;
    expect(facts).toEqual({
      receipts: 3,
      suggestions: 2,
      releases: 2,
      delivery_receipts: 3,
    });
  });
});
