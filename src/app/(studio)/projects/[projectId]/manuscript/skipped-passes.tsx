import {
  DEGRADATION_CODES,
  degradationNotice,
  type DegradationCode,
} from "@/lib/authoring-degradation";
import type { GenerationCompletionState } from "@/lib/run-events";

type PersistedDegradedPass = NonNullable<GenerationCompletionState["degraded"]>[number];

/**
 * Author-facing copy for the finishing passes a completed run had to skip.
 *
 * The parameter deliberately narrows to `code`. The persisted row also carries
 * an operator `reason` that can name a step, and a signature that cannot see it
 * is a stronger guarantee than a promise not to render it.
 *
 * Total: no persisted array can make this throw, and an unrecognized code is
 * dropped rather than guessed at. Dropping loses a caveat; inventing one would
 * tell an author something about their book that is not true.
 */
export function skippedPassNotices(
  degraded: readonly Pick<PersistedDegradedPass, "code">[] | undefined,
): string[] {
  const notices: string[] = [];
  for (const pass of degraded ?? []) {
    if (!Object.hasOwn(DEGRADATION_CODES, pass.code)) continue;
    const notice = degradationNotice(pass.code as DegradationCode);
    // Two chapters that both missed the editing pass are one caveat.
    if (!notices.includes(notice)) notices.push(notice);
  }
  return notices;
}

/**
 * A quiet caveat strip above the manuscript.
 *
 * The workflow already says this live, but that notice rides the event stream
 * and dies with the tab. This is the durable telling, on the page an author
 * actually returns to.
 *
 * Ember, not destructive: the book is finished and readable. Dressing a missing
 * polish pass as damage would misrepresent what the author has.
 */
export function SkippedPassesNotice({ notices }: { notices: string[] }) {
  if (notices.length === 0) return null;

  return (
    <section
      aria-labelledby="skipped-passes-title"
      className="rounded-sm border border-ember/40 bg-ember/8 px-4 py-3"
    >
      <p className="folio-label text-foreground">Finished with a caveat</p>
      <h2 id="skipped-passes-title" className="mt-1 text-sm font-semibold">
        {notices.length === 1
          ? "One finishing pass was skipped so your book could be delivered."
          : `${notices.length} finishing passes were skipped so your book could be delivered.`}
      </h2>
      <ul className="mt-1 max-w-3xl space-y-1 text-xs leading-relaxed text-muted-foreground">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </section>
  );
}
