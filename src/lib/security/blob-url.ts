/**
 * Which remote images the server may fetch, embed, or hand to a browser.
 *
 * Several surfaces turn an image reference into a request: the EPUB exporter
 * downloads every `<img src>` and packs the bytes into the file it returns, and
 * the studio, admin and reader views emit `<img>` tags that the viewer's
 * browser fetches. An author-supplied `![x](https://anything)` therefore means
 * either server-side request forgery (EPUB) or a tracking pixel aimed at
 * whoever opens the page (an admin reviewing a flagged book). The only images
 * any of them needs are ones this app uploaded to its own Blob store.
 */

const PUBLIC_BLOB_SUFFIX = ".public.blob.vercel-storage.com";

type BlobEnv = { BLOB_READ_WRITE_TOKEN?: string; BLOB_STORE_ID?: string; [key: string]: unknown };

/**
 * This deployment's public Blob hostname, when the store can be identified.
 *
 * `@vercel/blob` builds public URLs as `https://<storeId>.public.blob…`, and
 * reads the store id from the read-write token (`vercel_blob_rw_<id>_<secret>`)
 * or, under OIDC auth, from `BLOB_STORE_ID` (optionally `store_`-prefixed).
 * Hostnames are case-insensitive and `URL` lowercases them, so compare lower.
 */
export function ownedBlobHostname(env: BlobEnv = process.env): string | null {
  const fromToken = env.BLOB_READ_WRITE_TOKEN?.split("_")[3];
  const fromEnv = env.BLOB_STORE_ID?.trim().replace(/^store_/, "");
  const storeId = fromToken || fromEnv;
  if (!storeId || !/^[A-Za-z0-9]+$/.test(storeId)) return null;
  return `${storeId.toLowerCase()}${PUBLIC_BLOB_SUFFIX}`;
}

/**
 * True for an https URL on this deployment's public Blob store. When the store
 * cannot be identified (local development, unit tests) any public Vercel Blob
 * host is accepted — still never an arbitrary origin.
 */
export function isOwnedBlobUrl(
  value: string | null | undefined,
  env: BlobEnv = process.env,
): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const owned = ownedBlobHostname(env);
    if (owned) return url.hostname === owned;
    return (
      url.hostname === "public.blob.vercel-storage.com" || url.hostname.endsWith(PUBLIC_BLOB_SUFFIX)
    );
  } catch {
    return false;
  }
}

/**
 * Builds the `imageUrl` filter for `markdownToHtml`: an image survives only
 * when it is an owned Blob URL *and* one of the project's own assets. Anything
 * else renders as its alt text. `allowed === undefined` means the caller has no
 * asset list (an export snapshot captured before the list existed) and falls
 * back to the owned-store check alone.
 */
export function ownedImageUrlFilter(
  allowed: Iterable<string> | undefined,
): (href: string) => string | null {
  const set = allowed === undefined ? null : new Set(allowed);
  return (href) => (isOwnedBlobUrl(href) && (set === null || set.has(href)) ? href : null);
}
