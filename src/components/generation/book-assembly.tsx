"use client";

import {
  BookOpenText,
  Check,
  CircleStop,
  Layers3,
  PenLine,
  ScanSearch,
  Sparkles,
} from "lucide-react";

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
    case "awaiting_guidance":
      return "The premise is ready. Your story direction will shape the chapter plan.";
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

const PRODUCTION_STATIONS = [
  { label: "Imagine", detail: "Premise and stakes" },
  { label: "Map", detail: "Story architecture" },
  { label: "Cast", detail: "Canon and world" },
  { label: "Write", detail: "Chapter drafting" },
  { label: "Refine", detail: "Editorial review" },
  { label: "Bind", detail: "Finished manuscript" },
] as const;

function productionStation(stage: Stage): number {
  switch (stage) {
    case "queued":
    case "concept":
    case "awaiting_guidance":
      return 0;
    case "outline":
    case "awaiting_approval":
      return 1;
    case "bible":
      return 2;
    case "awaiting_credits":
    case "chapters":
      return 3;
    case "editing":
    case "continuity":
    case "revising":
      return 4;
    case "finalizing":
    case "done":
      return 5;
    case "failed":
    case "cancelled":
      return 3;
  }
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
    stage !== "awaiting_guidance" &&
    stage !== "awaiting_credits" &&
    stage !== "done" &&
    stage !== "failed" &&
    stage !== "cancelled";
  const activeStation = productionStation(stage);
  const visualStateKey = `${stage}-${drafted}-${counts.drafting}-${counts.reviewed}-${counts.final}`;

  return (
    <section
      aria-labelledby="book-assembly-title"
      className="instrument-surface-raised relative overflow-hidden rounded-sm"
    >
      <div className="border-b border-border px-5 pt-5 pb-6 sm:px-6">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="folio-label text-ai">Living manuscript</p>
            <h3 id="book-assembly-title" className="mt-1 text-lg font-semibold tracking-tight">
              {cancellationRequested ? "Manuscript saved so far" : "Watch the story become a book"}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {phaseCopy(stage, drafted, plannedTotal, cancellationRequested, counts.drafting)}
            </p>
          </div>
          {cancellationRequested ? (
            <CircleStop aria-hidden="true" className="mt-1 size-5 shrink-0 text-ai" />
          ) : reviewActive ? (
            <ScanSearch aria-hidden="true" className="mt-1 size-5 shrink-0 text-ai" />
          ) : draftingActive ? (
            <PenLine aria-hidden="true" className="mt-1 size-5 shrink-0 text-ai" />
          ) : stage === "concept" || stage === "outline" || stage === "bible" ? (
            <Sparkles aria-hidden="true" className="mt-1 size-5 shrink-0 text-ai" />
          ) : drafted > 0 ? (
            <Layers3 aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
          ) : null}
        </div>

        <div
          aria-hidden="true"
          className="production-workbench relative mt-6 overflow-hidden border-y border-border py-5"
        >
          <div className="production-energy-track absolute top-[2.15rem] right-[8.333%] left-[8.333%] h-px bg-border" />
          <ol className="relative z-[1] grid grid-cols-6">
            {PRODUCTION_STATIONS.map((station, index) => {
              const complete = index < activeStation || stage === "done";
              const active = index === activeStation && stage !== "done";
              return (
                <li key={station.label} className="min-w-0 px-0.5 text-center sm:px-2">
                  <span
                    className={cn(
                      "production-station mx-auto grid size-5 place-items-center rounded-full border bg-background text-[0.55rem] font-semibold tabular-nums",
                      complete && "border-success bg-success/15 text-success",
                      active && "production-station-active border-ai bg-ai/15 text-ai",
                      !complete && !active && "border-border text-muted-foreground",
                    )}
                  >
                    {complete ? <Check className="size-3" /> : index + 1}
                  </span>
                  <span
                    className={cn(
                      "mt-2 block text-[0.56rem] font-semibold tracking-[0.06em] uppercase sm:text-[0.6875rem]",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {station.label}
                  </span>
                  <span className="mt-0.5 hidden text-[0.625rem] leading-tight text-muted-foreground sm:block">
                    {station.detail}
                  </span>
                </li>
              );
            })}
          </ol>

          {productionActive ? (
            <div
              key={visualStateKey}
              className="production-travelling-folio pointer-events-none absolute top-[1.05rem] z-[2] h-8 w-6 border border-ai/75 bg-paper shadow-[0_0_1.25rem_color-mix(in_oklch,var(--ai)_38%,transparent)]"
              style={{
                left: `calc(${((activeStation + 0.5) / PRODUCTION_STATIONS.length) * 100}% - 0.75rem)`,
              }}
            >
              <span className="absolute top-2 left-1.5 h-px w-3 bg-primary/80" />
              <span className="absolute top-3.5 left-1.5 h-px w-2 bg-paper-muted/50" />
              <span className="absolute top-5 left-1.5 h-px w-3 bg-paper-muted/40" />
            </div>
          ) : null}
        </div>
      </div>

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
          <p className="font-mono text-[0.6875rem] tracking-[0.04em] text-muted-foreground">
            Run plan: {plannedTotal} chapters × ~
            {new Intl.NumberFormat("en-US").format(targetWordsPerChapter)} words
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-y border-border py-4 sm:grid-cols-4">
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
