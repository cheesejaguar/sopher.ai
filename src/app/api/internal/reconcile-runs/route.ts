import { timingSafeEqual } from "node:crypto";

import { reconcileActiveExportRuns } from "@/lib/export-dispatch";
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

  const [authoringResults, exportResults] = await Promise.all([
    reconcileActiveAuthoringRuns({ limit: 250 }),
    reconcileActiveExportRuns({ limit: 250 }),
  ]);
  return Response.json({
    inspected: authoringResults.length + exportResults.length,
    completed:
      authoringResults.filter((result) => result.outcome === "completed").length +
      exportResults.filter((result) => result.outcome === "completed").length,
    failed:
      authoringResults.filter((result) => result.outcome === "failed").length +
      exportResults.filter((result) => result.outcome === "failed").length,
    cancelled:
      authoringResults.filter((result) => result.outcome === "cancelled").length +
      exportResults.filter((result) => result.outcome === "cancelled").length,
    unchanged:
      authoringResults.filter((result) => result.outcome === "unchanged").length +
      exportResults.filter((result) => result.outcome === "unchanged").length,
    errors:
      authoringResults.filter((result) => result.outcome === "error").length +
      exportResults.filter((result) => result.outcome === "error").length,
  });
}
