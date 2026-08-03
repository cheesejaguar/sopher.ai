"use client";

import { BookOpenText, Check, CircleStop, Layers3, PenLine, ScanSearch } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ChapterProgress } from "@/hooks/use-run-stream";
import type { Stage } from "@/lib/run-events";

type AssemblyStatus = "planned" | "drafting" | "assembled" | "reviewed" | "final";

function statusLabel(status: AssemblyStatus, cancellationRequested: boolean): string {
  if (status === "drafting") {
    return cancellationRequested ? "finishing at the safe boundary" : "being written";
  }
  return status;
}

function assemblyStatus(chapter: ChapterProgress | undefined): AssemblyStatus {
  switch (chapter?.status) {
    case "drafting":
      return "drafting";
    case "drafted":
      return "assembled";
    case "edited":
      return "reviewed";
    case "final":
      return "final";
    default:
      return "planned";
  }
}

function phaseCopy(
  stage: Stage,
  drafted: number,
  total: number,
  cancellationRequested: boolean,
  settling: number,
): string {
  if (cancellationRequested) {
    return settling > 0
      ? `${drafted} of ${total} chapters are safely assembled. In-flight chapter work is finishing at the current safe boundary.`
      : `${drafted} of ${total} chapters are safely assembled while the Studio confirms the stop.`;
  }

  switch (stage) {
    case "queued":
      return "The production desk is ready for the brief.";
    case "concept":
      return "The premise, stakes, and central journey are taking shape.";
    case "outline":
      return "The story is being mapped chapter by chapter.";
    case "awaiting_approval":
      return "The chapter plan is ready for the author’s approval.";
    case "awaiting_credits":
      return drafted > 0
        ? `${drafted} of ${total} chapters are safely assembled while production is paused.`
        : "Production is paused before any metered writing begins.";
    case "bible":
      return "Characters, places, and story canon are being prepared for every writer.";
    case "chapters":
      return `${drafted} of ${total} chapters are assembled in the manuscript.`;
    case "editing":
      return "Drafted chapters are moving through the editorial pass.";
    case "continuity":
      return "The assembled manuscript is being read for consistency from end to end.";
    case "revising":
      return "Review notes are being applied to the chapters that need them.";
    case "finalizing":
      return "The reviewed pages are being prepared as one finished manuscript.";
    case "done":
      return "Every finished chapter is assembled into the book.";
    case "failed":
      return "Production stopped; completed chapter work remains saved.";
    case "cancelled":
      return "Production was stopped; completed chapter work remains saved.";
  }
}

function isReviewStage(stage: Stage): boolean {
  return stage === "editing" || stage === "continuity" || stage === "revising";
}

/**
 * A state-backed view of the book taking shape. Placeholder folios come from
 * the run's frozen chapter count; every upgrade comes from a persisted chapter
 * or stage event. The animation is decorative and becomes a complete static
 * stack under reduced motion.
 */
export function BookAssembly({
  chapters,
  titles,
  plannedTotal,
  targetWordsPerChapter,
  stage,
  cancellationRequested = false,
}: {
  chapters: Map<number, ChapterProgress>;
  titles: Record<number, string | null>;
  plannedTotal: number;
  targetWordsPerChapter: number;
  stage: Stage;
  cancellationRequested?: boolean;
}) {
  const folios = Array.from({ length: plannedTotal }, (_, index) => {
    const number = index + 1;
    return { number, status: assemblyStatus(chapters.get(number)) };
  });
  const counts = folios.reduce(
    (acc, folio) => {
      acc[folio.status] += 1;
      return acc;
    },
    { planned: 0, drafting: 0, assembled: 0, reviewed: 0, final: 0 },
  );
  const drafted = counts.assembled + counts.reviewed + counts.final;
  const reviewActive = isReviewStage(stage) && !cancellationRequested;
  const draftingActive = counts.drafting > 0;
  const productionActive =
    !cancellationRequested &&
    stage !== "awaiting_approval" &&
    stage !== "awaiting_credits" &&
    stage !== "done" &&
    stage !== "failed" &&
    stage !== "cancelled";

  return (
    <section
      aria-labelledby="book-assembly-title"
      className="instrument-surface-raised relative overflow-hidden rounded-sm"
    >
      <div className="grid gap-6 px-5 py-6 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <div
          aria-hidden="true"
          className="relative mx-auto flex min-h-48 w-full max-w-56 items-center justify-center"
        >
          <div
            className={cn(
              "production-book-page absolute h-36 w-28 translate-x-4 translate-y-3 border border-border/80 bg-card/80",
              productionActive && "production-book-page-active",
            )}
          />
          <div className="production-book-page absolute h-36 w-28 translate-x-2 translate-y-1.5 border border-border bg-card" />
          <div className="production-book-page relative h-36 w-28 overflow-hidden border border-primary/45 bg-paper px-4 py-5 text-paper-foreground shadow-[6px_8px_0_color-mix(in_oklch,var(--card)_80%,transparent)]">
            <span className="block h-px w-7 bg-primary/70" />
            <span className="mt-5 block h-1 w-16 bg-paper-muted/35" />
            <span className="mt-2 block h-1 w-12 bg-paper-muted/25" />
            <span className="mt-2 block h-1 w-14 bg-paper-muted/25" />
            <BookOpenText className="absolute right-3 bottom-3 size-4 text-primary/70" />
            {reviewActive ? (
              <span className="production-review-beam absolute inset-x-0 h-px" />
            ) : null}
          </div>
          <span className="folio-label absolute bottom-0 text-muted-foreground">
            {drafted.toString().padStart(2, "0")} / {plannedTotal.toString().padStart(2, "0")}{" "}
            chapters
          </span>
        </div>

        <div className="min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="book-assembly-title" className="text-lg font-semibold tracking-tight">
                {cancellationRequested
                  ? "Manuscript saved so far"
                  : "Watch the manuscript take shape"}
              </h3>
              <p className="mt-1 font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground">
                Run plan: {plannedTotal} chapters × ~
                {new Intl.NumberFormat("en-US").format(targetWordsPerChapter)} words
              </p>
            </div>
            {cancellationRequested ? (
              <CircleStop aria-hidden="true" className="mt-1 size-5 shrink-0 text-ai" />
            ) : reviewActive ? (
              <ScanSearch aria-hidden="true" className="mt-1 size-5 shrink-0 text-ai" />
            ) : draftingActive ? (
              <PenLine aria-hidden="true" className="mt-1 size-5 shrink-0 text-ai" />
            ) : drafted > 0 ? (
              <Layers3 aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
            ) : null}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {phaseCopy(stage, drafted, plannedTotal, cancellationRequested, counts.drafting)}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-3 border-y border-border py-4 sm:grid-cols-4">
            <div>
              <dt className="folio-label text-muted-foreground">
                {cancellationRequested ? "Settling now" : "Writing now"}
              </dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">{counts.drafting}</dd>
            </div>
            <div>
              <dt className="folio-label text-muted-foreground">Assembled</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">{drafted}</dd>
            </div>
            <div>
              <dt className="folio-label text-muted-foreground">Reviewed</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">
                {counts.reviewed + counts.final}
              </dd>
            </div>
            <div>
              <dt className="folio-label text-muted-foreground">Final</dt>
              <dd className="mt-1 font-mono text-sm tabular-nums">{counts.final}</dd>
            </div>
          </dl>

          <ol
            aria-label={`${plannedTotal}-chapter manuscript assembly`}
            className="mt-5 grid grid-cols-8 gap-1.5 sm:grid-cols-12"
          >
            {folios.map(({ number, status }) => (
              <li
                key={number}
                aria-label={`Chapter ${number}${titles[number] ? `, ${titles[number]}` : ""}: ${statusLabel(status, cancellationRequested)}`}
                title={`Chapter ${number}: ${statusLabel(status, cancellationRequested)}`}
                className={cn(
                  "relative flex h-7 min-w-0 items-center justify-center overflow-hidden rounded-[2px] border font-mono text-[11px] tabular-nums",
                  status === "planned" && "border-border text-muted-foreground",
                  status === "drafting" && "border-ai/70 bg-ai/10 text-ai",
                  status === "assembled" && "border-primary/60 bg-primary/15 text-primary",
                  status === "reviewed" && "border-ai bg-ai/20 text-foreground",
                  status === "final" && "border-success/70 bg-success/15 text-success",
                )}
              >
                {status === "final" ? (
                  <Check aria-hidden="true" className="size-3" />
                ) : (
                  <>
                    <span aria-hidden="true">{number.toString().padStart(2, "0")}</span>
                    <span
                      aria-hidden="true"
                      className="absolute top-0.5 right-0.5 text-[11px] leading-none font-bold uppercase"
                    >
                      {status === "planned"
                        ? "P"
                        : status === "drafting"
                          ? cancellationRequested
                            ? "S"
                            : "W"
                          : status === "assembled"
                            ? "A"
                            : "R"}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
          <p
            aria-hidden="true"
            className="mt-2 font-mono text-[11px] tracking-[0.03em] text-muted-foreground"
          >
            {cancellationRequested
              ? "P planned · S settling · A assembled · R reviewed · ✓ final"
              : "P planned · W writing · A assembled · R reviewed · ✓ final"}
          </p>
        </div>
      </div>
    </section>
  );
}
