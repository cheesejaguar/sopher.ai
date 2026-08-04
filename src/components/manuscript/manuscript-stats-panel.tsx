import type { ComponentType } from "react";
import { Check, Clock3, FileText, Minus, MoveDown, MoveUp } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { formatWordCount } from "@/lib/editor/chapter-status";
import {
  CHAPTER_PACE_TOLERANCE,
  describeChapterPace,
  formatReadingTime,
  WORDS_PER_PAGE,
  type ChapterPace,
  type ChapterWordStat,
  type ManuscriptStats,
} from "@/lib/manuscript-stats";
import { cn } from "@/lib/utils";

/**
 * Target versus actual length, for the book and for every chapter in it.
 *
 * Pure presentation over `manuscriptStats()` with no data access of its own, so
 * the reading view, book setup and the editor can each drop it in beside
 * whatever they have already loaded.
 */

/**
 * Running long and running short are both ordinary states of a draft, so
 * neither gets an alarm colour — only landing on target earns success green.
 * Ember belongs to cost and warnings and would badly overstate a long chapter.
 */
const PACE_STYLES: Record<
  ChapterPace,
  { tone: string; icon: ComponentType<{ className?: string }> }
> = {
  empty: { tone: "text-muted-foreground", icon: Minus },
  under: { tone: "text-muted-foreground", icon: MoveDown },
  on_target: { tone: "text-success", icon: Check },
  over: { tone: "text-muted-foreground", icon: MoveUp },
};

function ChapterRow({ stat }: { stat: ChapterWordStat }) {
  const { tone, icon: Icon } = PACE_STYLES[stat.pace];
  // Capped so a runaway chapter cannot paint outside its track; the numeric
  // delta beside the bar still tells the whole truth.
  const filled =
    stat.targetWords > 0 ? Math.min(100, Math.round((stat.words / stat.targetWords) * 100)) : 0;

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-6 shrink-0 font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
        {String(stat.number).padStart(2, "0")}
      </span>
      <span className="hidden min-w-0 flex-1 truncate text-xs font-medium sm:block">
        {stat.title ?? `Chapter ${stat.number}`}
      </span>
      <span
        aria-hidden="true"
        className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-muted sm:w-24"
      >
        <span className="block h-full rounded-full bg-primary" style={{ width: `${filled}%` }} />
      </span>
      <span className="shrink-0 font-mono text-[0.6875rem] tabular-nums">
        {formatWordCount(stat.words)}
        <span className="text-muted-foreground"> / {formatWordCount(stat.targetWords)}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          "flex w-12 shrink-0 items-center justify-end gap-1 font-mono text-[0.6875rem] tabular-nums",
          tone,
        )}
      >
        <Icon className="size-3 shrink-0" />
        {stat.pace === "empty"
          ? "—"
          : stat.pace === "on_target"
            ? "ok"
            : formatWordCount(Math.abs(stat.delta))}
      </span>
      <span className="sr-only">{describeChapterPace(stat)}</span>
    </li>
  );
}

function describeGoal(stats: ManuscriptStats): string {
  if (stats.targetWords === 0) return "No word goal set yet";
  if (stats.delta < 0) return `${formatWordCount(-stats.delta)} words to go`;
  if (stats.delta === 0) return "Exactly on the goal";
  return `${formatWordCount(stats.delta)} words past the goal`;
}

export function ManuscriptStatsPanel({
  stats,
  title = "Length and pace",
  className,
}: {
  stats: ManuscriptStats;
  title?: string;
  className?: string;
}) {
  return (
    // Labelled by value rather than by id: a page may render this panel more
    // than once (a chapter's stats beside the book's), and duplicate ids are
    // worse for a screen reader than a repeated label.
    <section
      aria-label={title}
      className={cn("instrument-surface overflow-hidden rounded-sm", className)}
    >
      <div className="border-b border-border p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
            {stats.writtenChapters}/{stats.totalChapters} chapters written
          </p>
        </div>

        <Progress
          value={stats.pct}
          aria-label={`${stats.pct}% of the word goal written: ${formatWordCount(
            stats.words,
          )} of ${formatWordCount(stats.targetWords)} words.`}
          className="mt-3 h-1"
        />

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="folio-label text-muted-foreground">Words</dt>
            <dd className="mt-1.5 font-mono text-lg leading-none tabular-nums">
              {formatWordCount(stats.words)}
              <span className="text-sm text-muted-foreground">
                {" / "}
                {formatWordCount(stats.targetWords)}
              </span>
            </dd>
            <dd className="mt-1.5 text-xs text-muted-foreground">{describeGoal(stats)}</dd>
          </div>

          <div className="min-w-0">
            <dt className="folio-label flex items-center gap-1 text-muted-foreground">
              <FileText aria-hidden="true" className="size-3" />
              Pages
            </dt>
            <dd className="mt-1.5 font-mono text-lg leading-none tabular-nums">
              ~{formatWordCount(stats.pages)}
            </dd>
            <dd className="mt-1.5 text-xs text-muted-foreground">
              {stats.matterPages > 0
                ? `${formatWordCount(stats.chapterPages)} of chapters, ${formatWordCount(
                    stats.matterPages,
                  )} of book matter`
                : `At ${WORDS_PER_PAGE} words a printed page`}
            </dd>
          </div>

          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="folio-label flex items-center gap-1 text-muted-foreground">
              <Clock3 aria-hidden="true" className="size-3" />
              Reading time
            </dt>
            <dd className="mt-1.5 font-mono text-lg leading-none tabular-nums">
              {formatReadingTime(stats.readingMinutes)}
            </dd>
            <dd className="mt-1.5 text-xs text-muted-foreground">Cover to cover, read silently</dd>
          </div>
        </dl>
      </div>

      {stats.chapters.length > 0 ? (
        <>
          <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground">
            Each chapter against its {formatWordCount(stats.chapters[0].targetWords)}-word target.
            Within {Math.round(CHAPTER_PACE_TOLERANCE * 100)}% counts as on target.
          </p>
          <ol className="divide-y divide-border">
            {stats.chapters.map((stat) => (
              <ChapterRow key={stat.number} stat={stat} />
            ))}
          </ol>
        </>
      ) : (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          Chapter lengths appear here as soon as the first chapter is written.
        </p>
      )}
    </section>
  );
}
