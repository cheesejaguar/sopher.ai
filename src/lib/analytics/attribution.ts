import type { Acquisition } from "@/db/schema";

/**
 * First-touch attribution.
 *
 * The question "which channel produced paying customers" cannot be answered by
 * GA alone: GA attributes sessions, but revenue lives in our ledger keyed by
 * user. Stamping the first touch onto the user row is what makes the join
 * possible.
 *
 * First-touch, not last: the ad that introduced someone to the product is what
 * the acquisition spend bought. Last-touch would credit the direct visit they
 * made on the way to paying, which is not a channel you can buy more of.
 */

export const ATTRIBUTION_COOKIE = "sopher_attr";
export const ANON_COOKIE = "sopher_aid";
/** Long enough to cover a slow consideration cycle, short enough to be honest. */
export const ATTRIBUTION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

const UTM_KEYS = ["source", "medium", "campaign", "term", "content"] as const;

/** Builds the first-touch record from a landing URL and its referrer. */
export function readAttribution(url: URL, referrer: string | null): Acquisition {
  const acquisition: Acquisition = {
    landingPath: url.pathname.slice(0, 200),
    capturedAt: new Date().toISOString(),
  };

  for (const key of UTM_KEYS) {
    const value = url.searchParams.get(`utm_${key}`);
    if (value) acquisition[key] = value.slice(0, 100);
  }

  // Host only. A full referrer URL can carry someone else's query string,
  // which is not ours to store.
  if (referrer) {
    try {
      const host = new URL(referrer).host;
      if (host && host !== url.host) acquisition.referrerHost = host.slice(0, 100);
    } catch {
      // Malformed referrer — no attribution rather than a bad one.
    }
  }

  return acquisition;
}

/** True when there is nothing worth recording (direct visit to the homepage). */
export function isEmptyAttribution(a: Acquisition): boolean {
  return !a.source && !a.medium && !a.campaign && !a.referrerHost;
}

export function parseAttributionCookie(raw: string | undefined): Acquisition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed || typeof parsed !== "object" || typeof parsed.capturedAt !== "string") return null;
    return parsed as Acquisition;
  } catch {
    return null;
  }
}
