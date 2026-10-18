/**
 * Reads a request body as text, refusing anything over `maxBytes`.
 *
 * For the unauthenticated endpoints (analytics ingest, CSP reports), where
 * `req.json()` would otherwise buffer whatever a caller chose to send. A
 * declared Content-Length is checked first, but it is only a claim — chunked
 * uploads have none — so the stream itself is counted and abandoned the
 * moment it passes the cap. Returns null when the body is too large or
 * unreadable.
 */
export async function readCappedText(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}
