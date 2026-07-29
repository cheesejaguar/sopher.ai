import { put } from "@vercel/blob";
import { generateText } from "ai";
import { eq } from "drizzle-orm";

import { gatewayOptions, metered } from "@/ai/metering";
import { MODELS, type QualityTier } from "@/ai/models";
import { getDb, schema } from "@/db";
import { getEntityForPortrait } from "@/db/queries/entities";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { assertCreditsForUsd, InsufficientCreditsError } from "@/lib/billing/credits";
import { PORTRAIT_KINDS, PORTRAIT_USD, portraitPrompt } from "@/lib/bible/portraits";
import type { EntityKind } from "@/ai/schemas/entities";

/**
 * Generates one entity portrait on demand. Never called automatically — the
 * image model bills per image and a whole cast would materially change a book's
 * unit economics, so this is always an explicit choice with the price shown.
 *
 * Goes through `metered()` like every other model call, so it lands in
 * `llm_calls` and counts against the user's budget.
 */

export const maxDuration = 120;

export async function POST(req: Request, ctx: { params: Promise<{ entityId: string }> }) {
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
  const { entityId } = await ctx.params;
  const entity = await getEntityForPortrait(entityId);
  if (!entity || entity.userId !== userId) {
    return Response.json({ error: "Entity not found" }, { status: 404 });
  }

  const kind = entity.kind as EntityKind;
  if (!PORTRAIT_KINDS.includes(kind)) {
    return Response.json({ error: `Portraits are not generated for ${kind}s` }, { status: 400 });
  }

  const db = getDb();
  const [project] = await db
    .select({ settings: schema.projects.settings })
    .from(schema.projects)
    .where(eq(schema.projects.id, entity.projectId))
    .limit(1);
  const tier: QualityTier = project?.settings.qualityTier ?? "standard";

  try {
    await assertCreditsForUsd(userId, PORTRAIT_USD);

    const model = MODELS[tier].image;
    const prompt = portraitPrompt({
      kind,
      name: entity.name,
      attrs: entity.attrs,
      genre: entity.genre,
    });

    const meter = {
      userId,
      projectId: entity.projectId,
      tier,
    } as Parameters<typeof metered>[0];

    const result = await metered(
      meter,
      { role: "content-tool", operation: "entity.portrait", model },
      () =>
        generateText({
          model,
          prompt,
          providerOptions: gatewayOptions(meter, "content-tool"),
        }),
    );

    const file = result.files.find((f) => f.mediaType?.startsWith("image/"));
    if (!file) {
      return Response.json({ error: "The image model returned no image" }, { status: 502 });
    }

    const contentType = file.mediaType ?? "image/png";
    const blob = await put(
      `portraits/${entity.projectId}/${entityId}-${crypto.randomUUID()}.png`,
      Buffer.from(file.uint8Array),
      { access: "public", contentType },
    );

    const [asset] = await db
      .insert(schema.assets)
      .values({
        projectId: entity.projectId,
        kind: "portrait",
        blobUrl: blob.url,
        blobPathname: blob.pathname,
        contentType,
        sizeBytes: file.uint8Array.byteLength,
        meta: { entityId, prompt },
      })
      .returning({ id: schema.assets.id });

    await db
      .update(schema.entities)
      .set({ portraitAssetId: asset.id, updatedAt: new Date() })
      .where(eq(schema.entities.id, entityId));

    return Response.json({ url: blob.url });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: "Not enough credits" }, { status: 402 });
    }
    throw error;
  }
}
