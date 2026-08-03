import { NextResponse } from "next/server";
import { z } from "zod";

import {
  loadReaderEdition,
  readerShareIdSchema,
  readerShareTokenSchema,
} from "@/lib/publication-editions";
import {
  READER_SESSION_MAX_AGE_SECONDS,
  readerSessionCookieName,
  readerSessionCookiePath,
} from "@/lib/reader-session";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";

const bodySchema = z.object({ shareId: readerShareIdSchema, token: readerShareTokenSchema });

export async function POST(req: Request) {
  const limited = await rateLimit(LIMITS.readerSession, req, undefined);
  if (limited.limited) return limited.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  const edition = parsed.success ? await loadReaderEdition(parsed.data.token) : null;
  if (!parsed.success || !edition || edition.shareId !== parsed.data.shareId) {
    const response = NextResponse.json({ error: "Reader link not found" }, { status: 404 });
    if (parsed.success) {
      response.cookies.set(readerSessionCookieName(parsed.data.shareId), "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: readerSessionCookiePath(parsed.data.shareId),
        maxAge: 0,
      });
    }
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }

  const response = NextResponse.json({ opened: true });
  response.cookies.set(readerSessionCookieName(parsed.data.shareId), parsed.data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: readerSessionCookiePath(parsed.data.shareId),
    maxAge: READER_SESSION_MAX_AGE_SECONDS,
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
