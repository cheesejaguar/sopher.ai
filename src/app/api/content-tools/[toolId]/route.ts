import { eq } from "drizzle-orm";
import { z } from "zod";

import { ContentToolError, getContentTool } from "@/ai/content-tools/registry";
import { type QualityTier } from "@/ai/models";
import { getDb, schema } from "@/db";
import { getChapterOwnership } from "@/db/queries/books";
import { assertNotSuspended, requireUser, SuspendedError, UnauthorizedError } from "@/lib/auth";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { assertCreditsForUsd, InsufficientCreditsError } from "@/lib/billing/credits";

export const maxDuration = 120;

const bodySchema = z.object({
  chapterId: z.uuid(),
  text: z.string().min(1).max(8_000),
  options: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ toolId: string }> }) {
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
  const limited = await rateLimit(LIMITS.llmTool, req, userId);
  if (limited.limited) return limited.response;

  const { toolId } = await ctx.params;
  const tool = getContentTool(toolId);
  if (!tool) return Response.json({ error: "Unknown content tool" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { chapterId, text, options } = parsed.data;

  const ownership = await getChapterOwnership(chapterId);
  if (!ownership || ownership.userId !== userId) {
    return Response.json({ error: "Chapter not found" }, { status: 404 });
  }

  const db = getDb();
  const [project] = await db
    .select({ settings: schema.projects.settings })
    .from(schema.projects)
    .where(eq(schema.projects.id, ownership.projectId))
    .limit(1);
  const tier: QualityTier = project?.settings.qualityTier ?? "standard";

  try {
    await assertCreditsForUsd(userId, tool.estUsd);
    const output = await tool.run(
      {
        meter: { userId, projectId: ownership.projectId },
        tier,
        projectId: ownership.projectId,
        chapterId,
      },
      { text, options },
    );

    // Audit row. `usd` records the tool's estimate — per-call ground truth
    // lives in llm_calls via metered().
    await db.insert(schema.contentToolRuns).values({
      userId,
      projectId: ownership.projectId,
      chapterId,
      toolId: tool.id,
      input: { text, options: options ?? {} },
      output,
      usd: tool.estUsd.toFixed(6),
    });

    return Response.json({ output });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return Response.json({ error: error.message }, { status: 402 });
    }
    if (error instanceof ContentToolError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}
