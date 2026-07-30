const pendingKeys = new Map<string, string>();
const responseKeys = new WeakMap<Response, { fingerprint: string; storageKey: string }>();
const STORAGE_PREFIX = "sopher:paid-intent:";

async function storageKey(fingerprint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fingerprint));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${STORAGE_PREFIX}${hex}`;
}

function readPersistedKey(key: string): string | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function persistKey(key: string, value: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(key, value);
  } catch {
    // In-memory idempotency remains available when storage is blocked.
  }
}

function clearPersistedKey(key: string): void {
  try {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(key);
  } catch {
    // A stale key is safer than silently replaying ambiguous paid work.
  }
}

/**
 * A successful HTTP response is not delivery by itself: JSON parsing or the UI
 * update can still fail after the provider was charged. Paid callers explicitly
 * acknowledge only after the result has been applied, so a reload in that gap
 * reuses the same key and takes the server's compensated-redo path.
 */
export function acknowledgePaidResponse(response: Response): void {
  const pending = responseKeys.get(response);
  if (!pending) return;
  responseKeys.delete(response);
  pendingKeys.delete(pending.fingerprint);
  clearPersistedKey(pending.storageKey);
}

export async function idempotentPaidFetch(
  url: string,
  init: RequestInit,
  fingerprint = `${url}\n${typeof init.body === "string" ? init.body : ""}`,
): Promise<Response> {
  const persistedStorageKey = await storageKey(fingerprint);
  const idempotencyKey =
    pendingKeys.get(fingerprint) ?? readPersistedKey(persistedStorageKey) ?? crypto.randomUUID();
  pendingKeys.set(fingerprint, idempotencyKey);
  persistKey(persistedStorageKey, idempotencyKey);
  const response = await fetch(url, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      "Idempotency-Key": idempotencyKey,
    },
  });
  if (response.ok) responseKeys.set(response, { fingerprint, storageKey: persistedStorageKey });
  return response;
}
