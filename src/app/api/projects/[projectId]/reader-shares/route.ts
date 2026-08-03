import { z } from "zod";

import { requireUser, UnauthorizedError } from "@/lib/auth";
import {
  createReaderShare,
  listReaderShares,
  readerShareRequestKeySchema,
  revokeReaderShare,
} from "@/lib/publication-editions";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";

export const maxDuration = 60;

const createSchema = z.object({
  requestKey: readerShareRequestKeySchema,
  label: z.string().max(120).optional(),
  expires: z.enum(["7d", "30d", "never"]).default("30d"),
  allowDownload: z.boolean().default(false),
  acceptedReaderTerms: z.literal(true),
});

const revokeSchema = z.object({ shareId: z.uuid() });

async function authenticatedUser(): Promise<string | Response> {
  try {
    return (await requireUser()).userId;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const auth = await authenticatedUser();
  if (auth instanceof Response) return auth;
  const { projectId } = await ctx.params;
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const shares = await listReaderShares(auth, projectId);
  if (!shares) return Response.json({ error: "Project not found" }, { status: 404 });
  return Response.json({ shares }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const auth = await authenticatedUser();
  if (auth instanceof Response) return auth;
  const { projectId } = await ctx.params;
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const limited = await rateLimit(LIMITS.readerShare, req, auth);
  if (limited.limited) return limited.response;
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "Reader link settings are invalid" }, { status: 400 });
  }

  const result = await createReaderShare({
    userId: auth,
    projectId,
    requestKey: parsed.data.requestKey,
    label: parsed.data.label,
    expires: parsed.data.expires,
    allowDownload: parsed.data.allowDownload,
  });
  if (result.outcome === "missing") {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }
  if (result.outcome === "empty") {
    return Response.json(
      { error: "Write at least one chapter before sharing a reader edition" },
      { status: 409 },
    );
  }
  if (result.outcome === "limit") {
    return Response.json(
      { error: "Revoke or let an existing reader link expire before creating another" },
      { status: 409 },
    );
  }
  if (result.outcome === "storage_limit") {
    return Response.json(
      { error: "This project has reached its retained reader-edition limit. Contact support." },
      { status: 409 },
    );
  }
  if (result.outcome === "too_large") {
    return Response.json(
      { error: "This manuscript is too large for a web reader edition. Export a file instead." },
      { status: 413 },
    );
  }
  return Response.json(
    {
      share: result.share,
      url: `/r/${result.share.id}#${new URLSearchParams({ token: result.token }).toString()}`,
      notice:
        "This is the only response that contains the secret reader URL. Copy it now; you can revoke it later.",
    },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function DELETE(req: Request, ctx: { params: Promise<{ projectId: string }> }) {
  const auth = await authenticatedUser();
  if (auth instanceof Response) return auth;
  const { projectId } = await ctx.params;
  if (!z.uuid().safeParse(projectId).success) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = revokeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: "A valid share ID is required" }, { status: 400 });
  }
  const revoked = await revokeReaderShare({
    userId: auth,
    projectId,
    shareId: parsed.data.shareId,
  });
  if (!revoked) {
    return Response.json({ error: "Active reader link not found" }, { status: 404 });
  }
  return Response.json({ revoked: true }, { headers: { "Cache-Control": "private, no-store" } });
}
