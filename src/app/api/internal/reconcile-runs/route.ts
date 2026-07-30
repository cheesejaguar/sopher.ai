import { timingSafeEqual } from "node:crypto";

import { reconcileActiveAuthoringRuns } from "@/lib/run-health";

export const maxDuration = 300;

function hasValidCronAuthorization(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;

  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function GET(request: Request) {
  if (!hasValidCronAuthorization(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await reconcileActiveAuthoringRuns({ limit: 250 });
  return Response.json({
    inspected: results.length,
    completed: results.filter((result) => result.outcome === "completed").length,
    failed: results.filter((result) => result.outcome === "failed").length,
    cancelled: results.filter((result) => result.outcome === "cancelled").length,
    unchanged: results.filter((result) => result.outcome === "unchanged").length,
    errors: results.filter((result) => result.outcome === "error").length,
  });
}
