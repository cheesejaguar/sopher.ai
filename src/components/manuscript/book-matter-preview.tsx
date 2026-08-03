import { BookOpenText, Check, Plus } from "lucide-react";

import { bookReadingOrder, type BookPageSlot } from "@/lib/manuscript-stats";
import type { BookMatter } from "@/lib/book-package";
import { cn } from "@/lib/utils";

/**
 * What the finished book looks like, front to back.
 *
 * "Half title", "epigraph" and "front matter" are publishing words, not author
 * words. This lays the assembled book out as a stack of pages a reader turns
 * through, shows which ones exist, and says in one line what each is for. The
 * order comes from `bookReadingOrder()`, which reads it off the exporters.
 */

/** A page as a page: ruled paper when it exists, an empty outline when it does not. */
function PageGlyph({ present, stacked }: { present: boolean; stacked?: boolean }) {
  const sheet = cn(
    "flex h-9 w-7 flex-col justify-center gap-[3px] rounded-[2px] border px-1.5",
    present ? "border-paper-edge bg-paper" : "border-dashed border-border bg-transparent",
  );

  return (
    <span aria-hidden="true" className="relative flex h-9 w-9 shrink-0 items-center justify-center">
      {stacked ? (
        <>
          <span className={cn(sheet, "absolute translate-x-1.5 rotate-3")} />
          <span className={cn(sheet, "absolute -translate-x-1.5 -rotate-3")} />
        </>
      ) : null}
      <span className={cn(sheet, "relative")}>
        {present ? (
          <>
            <span className="h-px w-full bg-paper-muted/50" />
            <span className="h-px w-4/5 bg-paper-muted/50" />
            <span className="h-px w-full bg-paper-muted/50" />
          </>
        ) : null}
      </span>
    </span>
  );
}

function SlotRow({ slot, position }: { slot: BookPageSlot; position: number | null }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <PageGlyph present={slot.present} stacked={slot.key === "chapters"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span
            className={cn(
              "text-sm font-medium",
              slot.present ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {slot.label}
          </span>
          {slot.present ? (
            <Check aria-hidden="true" className="size-3.5 shrink-0 translate-y-0.5 text-success" />
          ) : (
            <span className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
              <Plus aria-hidden="true" className="size-3" />
              {slot.required ? "Waiting on chapters" : "Optional — not added"}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{slot.blurb}</p>
        {slot.note ? (
          <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground/80">
            {slot.note}
          </p>
        ) : null}
      </div>
      <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-[0.6875rem] text-muted-foreground tabular-nums">
        {position === null ? (
          <span aria-hidden="true">·</span>
        ) : (
          <>
            <span className="sr-only">Page </span>
            {String(position).padStart(2, "0")}
          </>
        )}
      </span>
    </li>
  );
}

export function BookMatterPreview({
  matter,
  chapterCount,
  title = "Reading order",
  className,
}: {
  matter: BookMatter;
  chapterCount: number;
  title?: string;
  className?: string;
}) {
  const slots = bookReadingOrder(matter, chapterCount);
  // Only the pages that will actually be printed get a position, so the numbers
  // read as the order a reader turns through rather than a checklist index.
  let printed = 0;
  const numbered = slots.map((slot) => ({
    slot,
    position: slot.present ? ++printed : null,
  }));
  const missingOptional = slots.filter((slot) => !slot.present && !slot.required).length;

  return (
    <section
      aria-label={title}
      className={cn("instrument-surface overflow-hidden rounded-sm", className)}
    >
      <div className="border-b border-border p-4">
        <BookOpenText aria-hidden="true" className="size-4 text-primary" />
        <h3 className="mt-3 text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {printed} {printed === 1 ? "page is" : "pages are"} ready, in the order a reader meets
          them.
          {missingOptional > 0 ? ` ${missingOptional} optional pages are still empty.` : ""} Every
          export and the shared reader use this order.
        </p>
      </div>
      <ol className="divide-y divide-border">
        {numbered.map(({ slot, position }) => (
          <SlotRow key={slot.key} slot={slot} position={position} />
        ))}
      </ol>
    </section>
  );
}
