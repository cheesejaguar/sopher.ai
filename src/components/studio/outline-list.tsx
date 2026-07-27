import { cn } from "@/lib/utils";
import {
  chapterStatusLabels,
  formatWords,
  type Chapter,
  type ChapterStatus,
} from "@/lib/placeholder-data";

const dotClasses: Record<ChapterStatus, string> = {
  planned: "border border-muted-foreground/40 bg-transparent",
  drafting: "bg-ai motion-safe:animate-pulse",
  drafted: "bg-primary/60",
  edited: "bg-primary",
  final: "bg-primary ring-2 ring-primary/25",
};

export function OutlineList({ chapters }: { chapters: Chapter[] }) {
  return (
    <ol className="divide-y divide-border overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      {chapters.map((chapter) => (
        <li key={chapter.number} className="flex items-center gap-4 px-4 py-3">
          <span className="w-6 shrink-0 text-right font-mono text-sm text-muted-foreground tabular-nums">
            {chapter.number}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{chapter.title}</p>
            <p className="truncate text-sm text-muted-foreground">{chapter.summary}</p>
          </div>
          <span className="hidden shrink-0 font-mono text-xs text-muted-foreground tabular-nums sm:block">
            {chapter.wordCount > 0 ? `${formatWords(chapter.wordCount)} words` : "—"}
          </span>
          <span className="flex w-20 shrink-0 items-center justify-end gap-2">
            <span
              aria-hidden="true"
              className={cn("size-2 rounded-full", dotClasses[chapter.status])}
            />
            <span className="text-xs text-muted-foreground">
              {chapterStatusLabels[chapter.status]}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
