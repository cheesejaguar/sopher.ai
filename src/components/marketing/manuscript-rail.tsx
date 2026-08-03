"use client";

import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

import { useElementVisibility } from "@/hooks/use-element-visibility";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

import { PIPELINE_STEPS } from "./content";

const STAGE_COPY = [
  "Your spark becomes a story direction.",
  "The direction finds its shape.",
  "The shape opens into chapters.",
  "Each page gains pace, voice, and polish.",
  "The whole story becomes one coherent book.",
] as const;

const STAGE_LABELS = [
  "A one-sentence spark",
  "A chapter-by-chapter path",
  "A complete first draft",
  "An editorial proof",
  "An owned, editable book",
] as const;

function RuledLines({ count, edited = false }: { count: number; edited?: boolean }) {
  return (
    <span className="grid gap-3">
      {Array.from({ length: count }, (_, line) => (
        <span
          key={line}
          className={cn(
            "h-px bg-paper-muted/32",
            line % 3 === 2 ? "w-4/5" : "w-full",
            edited && line === 2 && "relative bg-destructive/65",
          )}
        >
          {edited && line === 2 ? (
            <span className="absolute -top-1.5 right-2 font-mono text-[0.4375rem] tracking-wider text-destructive uppercase">
              tighten
            </span>
          ) : null}
        </span>
      ))}
    </span>
  );
}

function StoryArtifact({ index }: { index: number }) {
  const finalStage = index === PIPELINE_STEPS.length - 1;

  return (
    <div className="journey-artifact relative mx-auto flex min-h-[16.5rem] w-full max-w-[27rem] items-center justify-center px-3 py-5 sm:px-8">
      <span
        aria-hidden="true"
        className="absolute inset-x-4 top-1/2 h-24 -translate-y-1/2 border border-ion/20 sm:inset-x-7"
      />
      <span
        aria-hidden="true"
        className="absolute top-7 bottom-7 left-1/2 w-px -translate-x-1/2 bg-primary/35 shadow-[0_0_22px_var(--primary)]"
      />

      <div
        key={index}
        aria-hidden="true"
        className={cn(
          "journey-stage-enter relative w-full text-paper-foreground",
          finalStage ? "max-w-[23rem]" : "max-w-[15.5rem]",
        )}
      >
        {index >= 2 && !finalStage ? (
          <>
            <span className="absolute inset-0 translate-x-3 translate-y-3 border border-paper-edge/80 bg-paper/55" />
            <span className="absolute inset-0 translate-x-1.5 translate-y-1.5 border border-paper-edge bg-paper/75" />
          </>
        ) : null}

        {finalStage ? (
          <div className="grid min-h-[13.5rem] grid-cols-2 divide-x divide-paper-edge border border-paper-edge bg-paper shadow-[0_22px_60px_-28px_color-mix(in_oklch,var(--ion)_65%,transparent)]">
            {[0, 1].map((page) => (
              <span key={page} className="relative overflow-hidden px-4 py-5 sm:px-5">
                <span className="font-mono text-[0.5rem] tracking-[0.14em] text-paper-muted uppercase">
                  {page === 0 ? "Biscuit saves trash day" : "Chapter one"}
                </span>
                <span className="mt-5 block">
                  <RuledLines count={page === 0 ? 7 : 8} />
                </span>
                <span className="absolute right-4 bottom-3 font-mono text-[0.5rem] text-paper-muted">
                  {String(page + 1).padStart(2, "0")}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <div className="relative min-h-[13.5rem] overflow-hidden border border-paper-edge bg-paper px-5 py-5 shadow-[0_22px_60px_-30px_color-mix(in_oklch,var(--ion)_60%,transparent)] sm:px-6">
            <span className="absolute top-0 bottom-0 left-4 w-px bg-destructive/38" />

            {index === 0 ? (
              <>
                <span className="font-mono text-[0.5rem] tracking-[0.14em] text-paper-muted uppercase">
                  The spark
                </span>
                <p className="mt-7 max-w-[13rem] font-sans text-sm leading-6 font-medium">
                  A bedtime adventure about Biscuit, a beagle whose superpowers arrive every trash
                  day.
                </p>
                <span className="mt-7 block h-px w-12 bg-primary" />
              </>
            ) : null}

            {index === 1 ? (
              <>
                <span className="font-mono text-[0.5rem] tracking-[0.14em] text-paper-muted uppercase">
                  Story path
                </span>
                <ol className="mt-5 grid gap-3 font-sans text-[0.6875rem] leading-4">
                  {[
                    "The truck arrives",
                    "Biscuit takes flight",
                    "The bins escape",
                    "Home before bed",
                  ].map((beat, beatIndex) => (
                    <li key={beat} className="grid grid-cols-[1rem_1fr] gap-2">
                      <span className="font-mono text-primary">{beatIndex + 1}</span>
                      <span>{beat}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : null}

            {index === 2 ? (
              <>
                <span className="flex items-center justify-between font-mono text-[0.5rem] tracking-[0.14em] text-paper-muted uppercase">
                  <span>Draft / chapter 01</span>
                  <span>1 of 8</span>
                </span>
                <p className="mt-5 font-serif text-sm leading-6">
                  Biscuit was an ordinary beagle six days a week. But on Tuesday mornings, when the
                  trash truck groaned down Alder Street…
                </p>
                <span className="absolute right-0 bottom-7 h-5 w-1 bg-ion" />
              </>
            ) : null}

            {index === 3 ? (
              <>
                <span className="flex items-center justify-between font-mono text-[0.5rem] tracking-[0.14em] text-paper-muted uppercase">
                  <span>Editorial proof</span>
                  <span className="text-destructive">Pass 02</span>
                </span>
                <span className="mt-6 block">
                  <RuledLines count={8} edited />
                </span>
                <span className="absolute right-5 bottom-4 border-l border-primary pl-2 font-mono text-[0.5rem] tracking-wider text-primary uppercase">
                  Voice held
                </span>
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * One idea visibly matures through five editorial stages. The labels remain
 * server-readable; motion only changes the active proof and can be paused.
 */
export function ManuscriptRail() {
  const reducedMotion = useReducedMotion();
  const { ref: journeyRef, isVisible } = useElementVisibility<HTMLElement>({
    threshold: 0.05,
  });
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reducedMotion || paused || !isVisible) return;
    const timer = window.setInterval(
      () => setActive((stage) => (stage + 1) % PIPELINE_STEPS.length),
      2400,
    );
    return () => window.clearInterval(timer);
  }, [isVisible, paused, reducedMotion]);

  const visibleActive = reducedMotion ? PIPELINE_STEPS.length - 1 : active;
  const selectStage = (index: number) => {
    setActive(index);
    setPaused(true);
  };

  return (
    <nav
      ref={journeyRef}
      aria-label="Five-stage story journey"
      className="instrument-surface-raised relative mx-auto w-full max-w-2xl overflow-hidden rounded-md"
    >
      <div className="flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
        <span>
          <span className="folio-label block text-ion">One idea / five editorial stages</span>
          <span className="mt-1 block text-sm font-medium">Watch the page take shape</span>
        </span>
        {!reducedMotion ? (
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={paused ? "Resume story journey" : "Pause story journey"}
            className="grid size-11 shrink-0 place-items-center rounded-full border border-border text-muted-foreground transition-colors hover:border-ion/60 hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {paused ? (
              <Play aria-hidden="true" className="size-3.5" />
            ) : (
              <Pause aria-hidden="true" className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="folio-label text-muted-foreground">Complete book</span>
        )}
      </div>

      <div className="story-notebook-panel relative overflow-hidden">
        <div className="relative border-b border-border/75 px-4 pt-5 sm:px-5">
          <div className="flex min-h-10 items-start justify-between gap-3">
            <span className="font-mono text-[0.6875rem] tracking-[0.12em] text-primary uppercase">
              {PIPELINE_STEPS[visibleActive].num} / {PIPELINE_STEPS[visibleActive].name}
            </span>
            <span className="max-w-[11rem] text-right text-xs leading-5 text-muted-foreground">
              {STAGE_LABELS[visibleActive]}
            </span>
          </div>
          <StoryArtifact index={visibleActive} />
        </div>

        <div className="relative bg-instrument/90">
          <span
            aria-hidden="true"
            className="absolute top-[1.3rem] right-[10%] left-[10%] h-px bg-border"
          >
            <span
              className="block h-px bg-ion transition-[width] duration-700"
              style={{
                width: `${(visibleActive / (PIPELINE_STEPS.length - 1)) * 100}%`,
              }}
            />
          </span>
          <ol className="relative grid grid-cols-5">
            {PIPELINE_STEPS.map((step, index) => {
              const isActive = index === visibleActive;
              return (
                <li key={step.name} className="relative min-w-0">
                  <a
                    href={`#pipeline-${step.name.toLowerCase()}`}
                    aria-current={isActive ? "step" : undefined}
                    onFocus={() => selectStage(index)}
                    onPointerEnter={() => selectStage(index)}
                    onClick={() => selectStage(index)}
                    className="group flex min-h-20 flex-col items-center px-1 py-3 text-center focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                  >
                    <span
                      className={cn(
                        "relative z-10 grid size-5 place-items-center rounded-full border bg-instrument font-mono text-[0.5rem] transition-colors",
                        isActive
                          ? "border-ion bg-ion text-background shadow-[0_0_14px_color-mix(in_oklch,var(--ion)_55%,transparent)]"
                          : "border-border text-muted-foreground group-hover:border-ion/60",
                      )}
                    >
                      {index + 1}
                    </span>
                    <span
                      className={cn(
                        "mt-2 block truncate text-[0.625rem] font-medium sm:text-[0.6875rem]",
                        isActive ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {step.name}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      <div className="grid min-h-[5.5rem] content-center gap-1 border-t border-border px-4 py-3 sm:min-h-0 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5">
        <p className="text-sm font-medium text-foreground">{STAGE_COPY[visibleActive]}</p>
        <p className="text-xs text-muted-foreground">You can guide every important choice.</p>
      </div>
    </nav>
  );
}
