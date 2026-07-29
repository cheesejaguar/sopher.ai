import { put } from "@vercel/blob";
import { generateText } from "ai";
import { and, eq } from "drizzle-orm";

import { gatewayOptions, metered } from "@/ai/metering";
import { MODELS, type QualityTier } from "@/ai/models";
import { getDb, schema } from "@/db";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import {
  assertCreditsForUsd,
  creditsForUsd,
  grantCredits,
  InsufficientCreditsError,
} from "@/lib/billing/credits";
import { MODEL_PRICING } from "@/lib/billing/pricing";

/**
 * Generates a book cover from the book's own identity — title, synopsis,
 * genre — and stores it as the project's cover asset. On demand only, priced
 * like every other image call, metered into llm_calls.
 */

export const maxDuration = 120;

const COVER_USD = MODEL_PRICING["google/gemini-3.1-flash-image"]?.perImageUsd ?? 0.067;

function coverPrompt(input: { title: string; synopsis: string | null; genre: string | null }) {
  return [
    `Book cover illustration for "${input.title}".`,
    input.genre ? `Genre: ${input.genre}.` : "",
    input.synopsis ? `The story: ${input.synopsis}` : "",
    `Portrait orientation, strong single focal image, atmospheric literary illustration,`,
    `painterly, muted palette, space at the top third where a title would sit.`,
    `No text, no lettering, no watermark, no borders.`,
  ]
    .filter(Boolean)
    .join(" ");
}

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

  // Paid path: the balance pre-check above is a read, so concurrent callers all
  // pass it. This is what bounds how far past the floor they can get.
  const limited = await rateLimit(LIMITS.imageGen, req, userId);
  if (limited.limited) return limited.response;
  const { projectId } = await ctx.params;
  const db = getDb();
  const [row] = await db
    .select({
      bookId: schema.books.id,
      title: schema.books.title,
      synopsis: schema.books.synopsis,
      frontMatter: schema.books.frontMatter,
      genre: schema.projects.genre,
      settings: schema.projects.settings,
    })
    .from(schema.books)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.books.projectId))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!row) return Response.json({ error: "Book not found" }, { status: 404 });

  try {
    await assertCreditsForUsd(userId, COVER_USD);
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: "Not enough credits" }, { status: 402 });
    }
    throw error;
  }

  const tier: QualityTier = row.settings.qualityTier ?? "standard";
  const model = MODELS[tier].image;
  const meter = { userId, projectId };

  const result = await metered(
    meter,
    { role: "content-tool", operation: "cover.generate", model },
    () =>
      generateText({
        model,
        prompt: coverPrompt(row),
        providerOptions: gatewayOptions(meter, "content-tool"),
      }),
  );

  // From here the user has already been debited (metered() charged the model
  // call). Any failure to actually deliver a cover refunds that debit — a
  // charge with nothing to show for it is the one outcome we never allow.
  async function refundAndFail(message: string): Promise<Response> {
    await grantCredits({
      userId,
      credits: creditsForUsd(COVER_USD),
      description: "Cover generation failed after billing — refunded",
      externalRef: `cover-refund:${crypto.randomUUID()}`,
      kind: "grant",
    });
    return Response.json({ error: message }, { status: 502 });
  }

  const file = result.files.find((f) => f.mediaType?.startsWith("image/"));
  if (!file) {
    return refundAndFail("The image model returned no image");
  }

  try {
    const contentType = file.mediaType ?? "image/png";
    const blob = await put(
      `covers/${projectId}/${crypto.randomUUID()}.png`,
      Buffer.from(file.uint8Array),
      { access: "public", contentType },
    );

    await db.insert(schema.assets).values({
      projectId,
      kind: "cover",
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      contentType,
      sizeBytes: file.uint8Array.byteLength,
      meta: { title: row.title },
    });

    // The cover URL rides in front_matter next to the author byline, so the
    // exports and reading view read one place for the book's identity.
    await db
      .update(schema.books)
      .set({
        frontMatter: { ...(row.frontMatter as Record<string, unknown>), coverUrl: blob.url },
        updatedAt: new Date(),
      })
      .where(eq(schema.books.id, row.bookId));

    return Response.json({ url: blob.url });
  } catch {
    return refundAndFail("Could not store the cover");
  }
}
