import { z } from "zod";

import { getAuthoringJourneySnapshot } from "@/db/queries/authoring-journey";
import { requireUser, UnauthorizedError } from "@/lib/auth";

export const maxDuration = 30;

/**
 * One compact, Workflow-aware source of truth for project navigation and
 * support surfaces. It intentionally excludes prompts, manuscript prose, run
 * configuration, and author input payloads.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ projectId: string }> }) {
  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  const { projectId } = await ctx.params;
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const journey = await getAuthoringJourneySnapshot({ userId, projectId });
  if (!journey) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  return Response.json(
    { journey },
    {
      headers: {
        "Cache-Control": "private, no-store",
      },
    },
  );
}
