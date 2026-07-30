import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";

const mutationSchema = z
  .object({
    action: z.literal("make_uncertain_handoff"),
    requestKey: z.uuid(),
  })
  .strict();

async function e2eUserId(): Promise<string | Response> {
  try {
    return (await requireUser()).userId;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }
}

/**
 * Authenticated inspection seam for isolated browser tests.
 *
 * It is deliberately absent in production and returns only records owned by
 * the current test identity for the supplied wizard request key.
 */
export async function GET(request: Request) {
  if (!isE2EWorkflowStubEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const authenticated = await e2eUserId();
  if (authenticated instanceof Response) return authenticated;
  const userId = authenticated;

  const requestKey = new URL(request.url).searchParams.get("requestKey");
  const parsed = z.uuid().safeParse(requestKey);
  if (!parsed.success) {
    return Response.json({ error: "A valid requestKey is required" }, { status: 400 });
  }

  const db = getDb();
  const projects = await db
    .select({
      id: schema.projects.id,
      experience: schema.projects.experience,
      targetChapters: schema.projects.targetChapters,
      targetWordsPerChapter: schema.projects.targetWordsPerChapter,
      settings: schema.projects.settings,
    })
    .from(schema.projects)
    .where(and(eq(schema.projects.userId, userId), eq(schema.projects.creationKey, parsed.data)));
  const projectIds = projects.map((project) => project.id);
  const runs =
    projectIds.length === 0
      ? []
      : await db
          .select({
            id: schema.generationRuns.id,
            projectId: schema.generationRuns.projectId,
            requestKey: schema.generationRuns.requestKey,
            status: schema.generationRuns.status,
            workflowRunId: schema.generationRuns.workflowRunId,
            acceptanceUncertainAt: schema.generationRuns.acceptanceUncertainAt,
            acceptanceDispatchClaimedAt: schema.generationRuns.acceptanceDispatchClaimedAt,
          })
          .from(schema.generationRuns)
          .where(
            and(
              eq(schema.generationRuns.userId, userId),
              inArray(schema.generationRuns.projectId, projectIds),
            ),
          )
          .orderBy(schema.generationRuns.createdAt);

  const activeStatuses = new Set(["queued", "running", "awaiting_input"]);
  return Response.json({
    projectCount: projects.length,
    runCount: runs.length,
    activeRunCount: runs.filter((run) => activeStatuses.has(run.status)).length,
    distinctRequestKeyCount: new Set(
      runs.map((run) => run.requestKey).filter((key): key is string => Boolean(key)),
    ).size,
    projects,
    runs,
  });
}

/**
 * Creates the one crash-recovery state that cannot be reached deterministically
 * from a browser without actually dropping a server response after Workflow
 * dispatch. The triple E2E guard above keeps this mutation absent from preview
 * and production deployments.
 */
export async function POST(request: Request) {
  if (!isE2EWorkflowStubEnabled()) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  const authenticated = await e2eUserId();
  if (authenticated instanceof Response) return authenticated;
  const userId = authenticated;
  const parsed = mutationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "A valid E2E mutation is required" }, { status: 400 });
  }

  const db = getDb();
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.userId, userId),
        eq(schema.projects.creationKey, parsed.data.requestKey),
      ),
    )
    .limit(1);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const [run] = await db
    .select({ id: schema.generationRuns.id })
    .from(schema.generationRuns)
    .where(
      and(
        eq(schema.generationRuns.userId, userId),
        eq(schema.generationRuns.projectId, project.id),
        eq(schema.generationRuns.requestKey, parsed.data.requestKey),
        eq(schema.generationRuns.status, "queued"),
        isNull(schema.generationRuns.workflowRunId),
      ),
    )
    .limit(1);
  if (!run) return Response.json({ error: "Queued run not found" }, { status: 404 });

  const [updated] = await db
    .update(schema.generationRuns)
    .set({
      acceptanceUncertainAt: new Date(),
      acceptanceDispatchClaimedAt: null,
    })
    .where(and(eq(schema.generationRuns.id, run.id), eq(schema.generationRuns.userId, userId)))
    .returning({ id: schema.generationRuns.id });
  if (!updated) return Response.json({ error: "Run was not updated" }, { status: 409 });

  return Response.json({ runId: updated.id, state: "uncertain_handoff" });
}
