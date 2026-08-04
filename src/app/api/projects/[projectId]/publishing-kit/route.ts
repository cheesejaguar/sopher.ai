import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  draftBookMatter,
  generatePublishingKit,
  publishingCallInfo,
} from "@/ai/agents/publishing-kit";
import {
  healReplayedMeteredDelivery,
  MeteredDeliveryPendingError,
  MeteredDeliveryReplayError,
  meteredCallAuthorizationUsd,
  refundMeteredDelivery,
  type MeterCtx,
} from "@/ai/metering";
import type { QualityTier } from "@/ai/models";
import { MAX_SUMMARIES_SENT, type PublishingBookFacts } from "@/ai/prompts/publishing-kit";
import { getDb, schema } from "@/db";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { assertCreditsForUsd, InsufficientCreditsError } from "@/lib/billing/credits";
import { InvalidIdempotencyKeyError, requireIdempotencyKey } from "@/lib/billing/idempotency";
import {
  BOOK_MATTER_DRAFT_FIELDS,
  readPublishingKit,
  type PublishingKit,
} from "@/lib/book-package";
import { authorizeProjectSpend, projectSpendAccessErrorResponse } from "@/lib/project-spend-http";
import {
  findPublishingDelivery,
  persistPublishingDelivery,
  publishingDeliveryReceiptRef,
  publishingMeteringIdempotencyKey,
  type PublishingDelivery,
  type PublishingDeliveryTarget,
} from "@/lib/publishing-kit-delivery";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";

export const maxDuration = 120;

const instruction = z.string().max(2_000).optional();
const bodySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("kit"), instruction }),
  z.object({ kind: z.literal("matter"), field: z.enum(BOOK_MATTER_DRAFT_FIELDS), instruction }),
]);

function deliveryResponse(delivery: PublishingDelivery): Response {
  return Response.json(
    delivery.kind === "kit"
      ? { kind: "kit", kit: delivery.kit, replayed: delivery.replayed }
      : { kind: "matter", field: delivery.field, text: delivery.text, replayed: delivery.replayed },
  );
}

function strings(value: unknown, limit: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((entry): entry is string => typeof entry === "string").slice(0, limit);
  return items.length > 0 ? items : undefined;
}

/**
 * The concept is the agent's own historical output, so it is read defensively:
 * a book written before a concept field existed still deserves a blurb.
 */
function conceptFacts(value: unknown): Partial<PublishingBookFacts> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const concept = value as Record<string, unknown>;
  const text = (key: string) =>
    typeof concept[key] === "string" && concept[key].trim() ? concept[key] : undefined;
  const characters = Array.isArray(concept.characters)
    ? concept.characters.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const character = entry as Record<string, unknown>;
        return typeof character.name === "string" && typeof character.role === "string"
          ? [{ name: character.name, role: character.role }]
          : [];
      })
    : undefined;
  return {
    logline: text("logline"),
    setting: text("setting"),
    centralConflict: text("centralConflict"),
    themes: strings(concept.themes, 6),
    uniqueElements: strings(concept.uniqueElements, 5),
    ...(characters && characters.length > 0 ? { characters: characters.slice(0, 6) } : {}),
  };
}

/**
 * The publishing copy kit — back-cover blurb, store description, keywords,
 * categories, author bio — and one-click drafts for a single front/back matter
 * page. Everything it needs already exists by the time a book is finished.
 *
 * The kit is saved into the book's matter; a drafted page is only returned, so
 * the author decides whether it ever replaces their own words.
 */
export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
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

  const { projectId } = await ctx.params;
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Project not found" }, { status: 404 });
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

  const raw: unknown = await req.json().catch(() => ({}));
  // The kit is the default request; a matter draft names its page explicitly.
  const parsed = bodySchema.safeParse({
    kind: "kit",
    ...(raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}),
  });
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const target: PublishingDeliveryTarget =
    parsed.data.kind === "kit" ? { kind: "kit" } : { kind: "matter", field: parsed.data.field };

  const db = getDb();
  const [row] = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      synopsis: schema.books.synopsis,
      concept: schema.books.concept,
      frontMatter: schema.books.frontMatter,
      genre: schema.projects.genre,
      subgenre: schema.projects.subgenre,
      targetChapters: schema.projects.targetChapters,
      settings: schema.projects.settings,
    })
    .from(schema.books)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!row) return Response.json({ error: "Book not found" }, { status: 404 });

  const meteringIdempotencyKey = publishingMeteringIdempotencyKey({
    projectId,
    target,
    operationKey: idempotencyKey,
  });
  const deliveryReceiptRef = publishingDeliveryReceiptRef({
    projectId,
    target,
    operationKey: idempotencyKey,
  });
  const loadDelivery = () =>
    findPublishingDelivery({ userId, projectId, target, operationKey: idempotencyKey });
  const healReplay = () =>
    healReplayedMeteredDelivery({
      userId,
      projectId,
      idempotencyKey,
      deliveryReceiptRef,
      meteringIdempotencyKey,
    });

  const delivered = await loadDelivery();
  if (delivered) {
    await healReplay();
    return deliveryResponse(delivered);
  }
  // Replays above are read-only; only new paid copy consumes the limit.
  const limited = await rateLimit(LIMITS.llmTool, req, userId);
  if (limited.limited) return limited.response;

  const spendDenied = await authorizeProjectSpend({ userId, projectId, operationKind: "optional" });
  if (spendDenied) return spendDenied;

  // Filter before the LIMIT, not after: an imported manuscript writes chapters
  // with no summary at all, so taking the first N rows and *then* dropping the
  // empty ones sent nothing and billed for a blurb written from the title alone.
  const summarised = sql`coalesce(trim(${schema.chapters.summary}), '') <> ''`;
  const [summaryTotal] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.chapters)
    .where(and(eq(schema.chapters.bookId, row.bookId), summarised));
  const summaries = await db
    .select({ summary: schema.chapters.summary })
    .from(schema.chapters)
    .where(and(eq(schema.chapters.bookId, row.bookId), summarised))
    .orderBy(asc(schema.chapters.chapterNumber))
    .limit(MAX_SUMMARIES_SENT);
  const matter = (row.frontMatter ?? {}) as Record<string, unknown>;
  const book: PublishingBookFacts = {
    title: row.title,
    ...(typeof matter.subtitle === "string" ? { subtitle: matter.subtitle } : {}),
    ...(typeof matter.author === "string" ? { author: matter.author } : {}),
    ...(row.genre ? { genre: row.genre } : {}),
    ...(row.subgenre ? { subgenre: row.subgenre } : {}),
    ...(row.synopsis ? { synopsis: row.synopsis } : {}),
    totalChapters: row.targetChapters,
    chapterSummaries: summaries.flatMap((chapter) => (chapter.summary ? [chapter.summary] : [])),
    summarisedChapters: summaryTotal?.count ?? 0,
    ...conceptFacts(row.concept),
  };

  const tier: QualityTier = row.settings.qualityTier ?? "standard";
  const meter: MeterCtx = {
    userId,
    projectId,
    authorizationUsd: 0.05,
    idempotencyKey: meteringIdempotencyKey,
    deliveryReceiptRef,
  };

  let kit: PublishingKit | undefined;
  let text: string | undefined;
  try {
    await assertCreditsForUsd(
      userId,
      meteredCallAuthorizationUsd(meter, publishingCallInfo({ kind: target.kind, tier })),
    );
    if (target.kind === "kit") {
      kit = await generatePublishingKit({
        meter,
        tier,
        book,
        ...(parsed.data.instruction ? { instruction: parsed.data.instruction } : {}),
      });
    } else {
      text = await draftBookMatter({
        meter,
        tier,
        book,
        field: target.field,
        ...(parsed.data.instruction ? { instruction: parsed.data.instruction } : {}),
      });
    }
  } catch (error) {
    const spendResponse = projectSpendAccessErrorResponse(error);
    if (spendResponse) return spendResponse;
    if (error instanceof MeteredDeliveryPendingError) {
      return Response.json({ error: error.message, code: "delivery_pending" }, { status: 409 });
    }
    if (error instanceof MeteredDeliveryReplayError) {
      const replay = await loadDelivery();
      if (replay) {
        await healReplay();
        return deliveryResponse(replay);
      }
    }
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: error.message }, { status: 402 });
    }
    throw error;
  }

  // Paid provider work that produced nothing usable is refunded here rather
  // than surfacing as a failed save the author cannot act on.
  if (target.kind === "kit" ? !readPublishingKit(kit) : !text) {
    await refundMeteredDelivery(meter, "Publishing copy came back empty — refunded");
    return Response.json({ error: "The copy came back empty. Please try again." }, { status: 502 });
  }

  let delivery: PublishingDelivery;
  try {
    delivery = await persistPublishingDelivery({
      userId,
      projectId,
      bookId: row.bookId,
      target,
      operationKey: idempotencyKey,
      ...(kit ? { kit } : {}),
      ...(text ? { text } : {}),
      meteredUsd: meter.lastSettlement?.meteredUsd ?? 0,
      optionalLeaseRefs: meter.optionalOperationLeaseRefs ?? [],
    });
  } catch (persistenceError) {
    try {
      const verified = await loadDelivery();
      if (verified) {
        delivery = verified;
      } else {
        const [receipt] = await db
          .select({ id: schema.creditLedger.id })
          .from(schema.creditLedger)
          .where(
            and(
              eq(schema.creditLedger.userId, userId),
              eq(schema.creditLedger.projectId, projectId),
              eq(schema.creditLedger.externalRef, deliveryReceiptRef),
            ),
          )
          .limit(1);
        if (receipt) {
          throw new Error("Publishing delivery receipt exists without its immutable output");
        }
        await refundMeteredDelivery(meter, "Publishing copy could not be saved — refunded");
        return Response.json({ error: "Could not save the publishing copy" }, { status: 503 });
      }
    } catch (verificationError) {
      throw new AggregateError(
        [persistenceError, verificationError],
        "Publishing-copy persistence failed and could not be verified",
      );
    }
  }
  meter.optionalOperationLeaseRefs = [];

  return deliveryResponse(delivery);
}
