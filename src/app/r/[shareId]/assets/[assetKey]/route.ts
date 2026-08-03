import { cookies } from "next/headers";

import {
  loadReaderEdition,
  publicationAssetUrls,
  readerShareIdSchema,
} from "@/lib/publication-editions";
import { readerSessionCookieName } from "@/lib/reader-session";

const MAX_READER_ASSET_BYTES = 20 * 1024 * 1024;
const SAFE_IMAGE_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);

function byteLimitedBody(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let delivered = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await reader.read();
      if (next.done) {
        controller.close();
        return;
      }
      delivered += next.value.byteLength;
      if (delivered > MAX_READER_ASSET_BYTES) {
        await reader.cancel("Reader asset exceeded its byte limit");
        controller.error(new Error("Reader asset exceeded its byte limit"));
        return;
      }
      controller.enqueue(next.value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ shareId: string; assetKey: string }> },
) {
  const { shareId, assetKey } = await ctx.params;
  if (!readerShareIdSchema.safeParse(shareId).success) {
    return new Response("Reader asset not found", { status: 404 });
  }
  const token = (await cookies()).get(readerSessionCookieName(shareId))?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(assetKey)) {
    return new Response("Reader asset not found", { status: 404 });
  }
  const loadedEdition = await loadReaderEdition(token);
  const edition = loadedEdition?.shareId === shareId ? loadedEdition : null;
  const upstreamUrl = edition ? publicationAssetUrls(edition.snapshot).get(assetKey) : null;
  if (!upstreamUrl) return new Response("Reader asset not found", { status: 404 });

  const upstream = await fetch(upstreamUrl, {
    cache: "no-store",
    redirect: "error",
    headers: { Accept: "image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*" },
  }).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    return new Response("Reader asset not found", { status: 404 });
  }
  const contentType = upstream.headers.get("content-type")?.split(";", 1)[0]?.toLowerCase() ?? "";
  const contentLength = Number(upstream.headers.get("content-length") ?? "0");
  if (
    !SAFE_IMAGE_TYPES.has(contentType) ||
    (Number.isFinite(contentLength) && contentLength > MAX_READER_ASSET_BYTES)
  ) {
    await upstream.body.cancel();
    return new Response("Reader asset not found", { status: 404 });
  }

  return new Response(byteLimitedBody(upstream.body), {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "sandbox",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive, noimageindex",
      "Referrer-Policy": "no-referrer",
    },
  });
}
