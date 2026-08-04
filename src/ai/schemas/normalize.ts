/**
 * Salvage helpers for structured model output.
 *
 * Anthropic's structured-output path strips every numeric and length bound
 * (`.min` / `.max` / `.length`) from the JSON schema before the model ever
 * sees it. The model cannot obey a cap it was never shown, so re-validating
 * the answer is the only enforcement — and that failure is deterministic:
 * the same request produces the same reasonable-but-unbounded answer, so a
 * retry burns the author's credits and fails identically. On 2026-08-04 that
 * discarded a finished 12-chapter book during an optional review pass.
 *
 * These helpers exist so a permissive wire schema can be pulled back onto the
 * strict domain type instead of thrown away. Every one of them is total: no
 * input throws, and none of them ever surfaces the value it rejected —
 * rejected values are model output and may carry manuscript prose, which must
 * never reach a log line or a persisted message (see
 * `src/lib/authoring-failures.ts`).
 */

/** Reads an unknown value as a plain record; anything else reads as empty. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Reads an unknown value as a list; anything else reads as empty. */
export function coerceArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Keeps the first `max` entries — models answer past a cap they cannot see. */
export function truncateArray<T>(items: readonly T[], max: number): T[] {
  return items.slice(0, Math.max(0, max));
}

/** Drops the entries a per-item normalizer could not salvage. */
export function compact<T>(items: readonly (T | null | undefined)[]): T[] {
  return items.filter((item): item is T => item !== null && item !== undefined);
}

/**
 * Finite number from a number or a numeric string. Booleans and empty strings
 * are not numbers in disguise and stay rejected.
 */
export function coerceNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Non-finite input falls to `min` — the least alarming end of any range. */
export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * Puts a score on the 0-1 scale the domain types use. With the `.max(1)` bound
 * invisible to the model, "85" and "8.5" are as likely an answer as "0.85", and
 * all three mean the same thing.
 *
 * The 1-10 band is read as a ten-point scale rather than a percentage on
 * purpose. Both readings are possible for an answer like `8`, but a reviewer
 * scoring a manuscript 8 out of 100 is not a real outcome, while 8 out of 10 is
 * the single most common way a model ignores a stated 0-1 range. Guessing
 * percentage here would turn a good book into 0.08 — and this number is
 * load-bearing: it is persisted as the chapter quality score and shown to the
 * author as the review score.
 */
export function rescaleUnitScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rescaled = value <= 1 ? value : value <= 10 ? value / 10 : value / 100;
  return clampNumber(rescaled, 0, 1);
}

/** Safe integer from a number or numeric string; `"3"` and `3.4` both give 3. */
export function coerceInt(value: unknown): number | null {
  const parsed = coerceNumber(value);
  if (parsed === null) return null;
  const rounded = Math.round(parsed);
  return Number.isSafeInteger(rounded) ? rounded : null;
}

/** Integer list, dropping entries that are not numbers in any readable form. */
export function coerceIntArray(value: unknown): number[] {
  return compact(coerceArray(value).map((entry) => coerceInt(entry)));
}

export function coerceString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/** Trimmed text, or null when there is nothing a reader could use. */
export function coerceNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function truncateString(value: string, max: number): string {
  return value.length > max ? value.slice(0, Math.max(0, max)).trimEnd() : value;
}

/** Text list, dropping non-strings and blanks rather than keeping empty slots. */
export function coerceStringArray(value: unknown): string[] {
  return compact(coerceArray(value).map((entry) => coerceNonEmptyString(entry)));
}

export function coerceBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "no") return false;
  return fallback;
}

/**
 * Maps a model-chosen label onto a closed set, falling back when it is not one
 * of them. Matching ignores case and surrounding space — "Major" is the
 * model's own vocabulary — but never guesses at synonyms: an unrecognized
 * label means the caller's documented fallback, not an interpretation.
 */
export function oneOfOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  if (typeof value !== "string") return fallback;
  const needle = value.trim().toLowerCase();
  return allowed.find((option) => option.toLowerCase() === needle) ?? fallback;
}
