import { readCappedText } from "@/lib/security/body";
import { summarizeCspReports } from "@/lib/security/csp-report";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";

export const maxDuration = 10;

/** A single report is well under 2 KB; Reporting API batches stay small too. */
const MAX_REPORT_BODY_BYTES = 16 * 1024;

/**
 * Collector for the Report-Only CSP (`src/lib/security/headers.ts`). It exists
 * so the policy can be tuned toward enforcement from real violations rather
 * than guesses. Unauthenticated by necessity — browsers send reports without
 * credentials — so it is IP-rate-limited, body-capped, writes nothing, and
 * logs a compact one-line summary per violation.
 *
 * Always 204: a report is fire-and-forget, and an error status here only adds
 * console noise to the page that triggered it.
 */
export async function POST(req: Request) {
  const noContent = new Response(null, { status: 204 });
  if ((await rateLimit(LIMITS.cspReport, req, undefined)).limited) return noContent;

  const raw = await readCappedText(req, MAX_REPORT_BODY_BYTES);
  if (!raw) return noContent;
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return noContent;
  }

  for (const summary of summarizeCspReports(payload)) {
    console.warn("[csp]", summary);
  }
  return noContent;
}
