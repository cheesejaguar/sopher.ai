import { cookies } from "next/headers";

import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";
import { ANON_COOKIE } from "@/lib/analytics/attribution";
import { isEventName, sanitizeProps } from "@/lib/analytics/events";

export const maxDuration = 10;

/**
 * Product-analytics ingest.
 *
 * Deliberately permissive about identity and strict about content: signed-out
 * visitors are most of the funnel, so auth is optional, but the event name must
 * be one of ours and props are capped and coerced to scalars. Without that this
 * is an open write endpoint into our database.
 *
 * Always 204, even on a rejected event. A browser cannot do anything useful
 * with an analytics error, and a 4xx here would show up as console noise on
 * every page for anyone running an extension that mangles the body.
 */
export async function POST(req: Request) {
  const noContent = new Response(null, { status: 204 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return noContent;

  const { name, props } = body as { name?: unknown; props?: unknown };
  if (!isEventName(name)) return noContent;

  // Signed-out is expected — that is the top of the funnel.
  let userId: string | null = null;
  try {
    ({ userId } = await requireUser());
  } catch {
    userId = null;
  }

  const anonId = (await cookies()).get(ANON_COOKIE)?.value?.slice(0, 64) ?? null;

  try {
    await getDb()
      .insert(schema.analyticsEvents)
      .values({
        name,
        userId,
        anonId,
        props: sanitizeProps(props),
      });
  } catch (error) {
    // A behavioural event is never worth failing a request over. Money and
    // usage accounting live in credit_ledger and llm_calls, which are written
    // transactionally elsewhere.
    console.warn("[events] insert failed:", error);
  }

  return noContent;
}
