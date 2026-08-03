/**
 * The analytics event contract. Client-safe — no DB, no secrets.
 *
 * A closed union rather than free-form strings, because the failure mode of
 * free-form event names is not an error: it is `book_started` and
 * `bookStarted` and `book-started` coexisting in the warehouse for six months
 * until someone notices the funnel undercounts.
 */

export const EVENT_NAMES = [
  /** Wizard step reached. The only funnel stage with no durable row behind it. */
  "wizard_step",
  /** Wizard left without submitting. */
  "wizard_abandon",
  /** Book generation started (wizard submit or an explicit re-run). */
  "book_started",
  /** A full-book run reached completion. */
  "book_completed",
  /** Credit checkout opened. */
  "begin_checkout",
  /** A pack was bought. Mirrors the ledger, which stays the source of truth. */
  "purchase",
  /** Balance ran out mid-run — the moment that decides whether they top up. */
  "credits_exhausted",
  /** A manuscript was exported in some format. */
  "export_downloaded",
  /** An AI suggestion was accepted into the prose. */
  "suggestion_applied",
  /** The Studio help drawer was opened. */
  "help_opened",
  /** The optional first-book checklist was hidden or restored. */
  "onboarding_checklist_changed",
] as const;

export type EventName = (typeof EVENT_NAMES)[number];

/** Scalars only — this is analytics, not a document store. */
export type EventProps = Record<string, string | number | boolean>;

export function isEventName(value: unknown): value is EventName {
  return typeof value === "string" && (EVENT_NAMES as readonly string[]).includes(value);
}

/**
 * Caps what a client can write. The endpoint is authenticated but a browser is
 * never trusted about size, and an unbounded props object is a free way to
 * store arbitrary data in our database.
 */
export const MAX_PROPS_KEYS = 12;
export const MAX_PROP_LENGTH = 200;

export function sanitizeProps(input: unknown): EventProps {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const out: EventProps = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_PROPS_KEYS) break;
    if (key.length > 40) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "boolean") out[key] = value;
    else if (typeof value === "string") out[key] = value.slice(0, MAX_PROP_LENGTH);
  }
  return out;
}
