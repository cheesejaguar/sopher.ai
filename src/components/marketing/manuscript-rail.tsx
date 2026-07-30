"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Pause, Play } from "lucide-react";

import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";

import { PIPELINE_STEPS } from "./content";

const STAGE_TRANSFORMS = [
  "-translate-x-5",
  "-translate-x-3",
  "translate-x-0",
  "translate-x-2",
  "translate-x-4",
] as const;

const STAGE_COPY = [
  "Brief becomes direction",
  "Direction becomes structure",
  "Structure becomes pages",
  "Pages become prose",
  "Prose becomes a book",
] as const;

const LINE_WIDTHS = [
  ["w-6", "w-4"],
  ["w-7", "w-5", "w-6"],
  ["w-8", "w-6", "w-7", "w-5"],
  ["w-8", "w-7", "w-5", "w-7"],
  ["w-7", "w-6", "w-5", "w-7"],
] as const;

function PageLines({ index }: { index: number }) {
  if (index === 1) {
    return (
      <span className="flex flex-col gap-1 px-2 py-2">
        {LINE_WIDTHS[index].map((width, line) => (
          <span key={`${width}-${line}`} className="grid grid-cols-[0.4rem_1fr] items-center gap-1">
            <span className="font-mono text-[0.35rem] leading-none text-[#6d6770]">{line + 1}</span>
            <span className={cn("h-px bg-[#6d6770]/55", width)} />
          </span>
        ))}
      </span>
    );
  }

  return (
    <span className="flex flex-col gap-1 px-2 py-2.5">
      {index === 0 ? <span className="mb-0.5 h-1 w-3 bg-[#6047d7]" /> : null}
      {LINE_WIDTHS[index].map((width, line) => (
        <span
          key={`${width}-${line}`}
          className={cn("h-px bg-[#6d6770]/55", width, index === 3 && line === 1 && "bg-[#b54552]")}
        />
      ))}
    </span>
  );
}

function PageArtifact({ index, active }: { index: number; active: boolean }) {
  const isSpread = index === PIPELINE_STEPS.length - 1;
  const dimensions = isSpread
    ? "h-[4.8rem] w-24"
    : index >= 3
      ? "h-[4.5rem] w-16"
      : index === 2
        ? "h-16 w-14"
        : index === 1
          ? "h-[3.8rem] w-12"
          : "h-14 w-11";

  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative block shrink-0 transition-[filter,opacity,transform] duration-500",
        dimensions,
        STAGE_TRANSFORMS[index],
        active ? "z-10 scale-105 opacity-100" : "opacity-58",
      )}
    >
      {index > 0 ? (
        <>
          <span className="absolute inset-0 translate-x-1 translate-y-1 border border-[#cfc8bd] bg-[#e8e2d8]" />
          {index > 1 ? (
            <span className="absolute inset-0 translate-x-2 translate-y-2 border border-[#bbb4aa] bg-[#d9d2c8]" />
          ) : null}
        </>
      ) : null}
      <span
        className={cn(
          "absolute inset-0 overflow-hidden border border-[#d7d0c5] bg-[#f8f5ec] text-[#28232a]",
          isSpread && "grid grid-cols-2 divide-x divide-[#ddd6cc]",
          active &&
            "shadow-[0_0_0_1px_color-mix(in_oklch,var(--ion)_72%,transparent),0_12px_28px_-18px_color-mix(in_oklch,var(--ion)_65%,transparent)]",
        )}
      >
        {isSpread ? (
          <>
            <PageLines index={index} />
            <PageLines index={index} />
          </>
        ) : (
          <PageLines index={index} />
        )}
        {active ? (
          <span className="rail-page-scan absolute inset-x-1 top-1 h-px bg-ion shadow-[0_0_8px_var(--ion)]" />
        ) : null}
      </span>
    </span>
  );
}

/**
 * The public signature: one brief visibly travels through five editorial
 * stages. All labels remain server-readable; motion only advances the active
 * proof and can be paused or replaced by the complete reduced-motion state.
 */
export function ManuscriptRail() {
  const reducedMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reducedMotion) return;
    if (paused) return;
    const timer = window.setInterval(
      () => setActive((stage) => (stage + 1) % PIPELINE_STEPS.length),
      1850,
    );
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion]);

  const visibleActive = reducedMotion ? PIPELINE_STEPS.length - 1 : active;

  return (
    <nav
      aria-label="Five-stage manuscript production rail"
      className="instrument-surface-raised relative mx-auto w-full max-w-xl overflow-hidden rounded-sm"
    >
      <div className="relative flex min-h-16 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-5">
        <span>
          <span className="folio-label block text-ion">Input / one clear brief</span>
          <span className="mt-1 block text-sm font-medium">Author direction enters the system</span>
        </span>
        {!reducedMotion ? (
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={
              paused ? "Resume manuscript production rail" : "Pause manuscript production rail"
            }
            className="grid size-11 shrink-0 place-items-center rounded-sm border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {paused ? (
              <Play aria-hidden="true" className="size-3.5" />
            ) : (
              <Pause aria-hidden="true" className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="folio-label text-muted-foreground">Complete sequence</span>
        )}
      </div>

      <div className="instrument-canvas relative overflow-hidden px-3 py-3 sm:px-4">
        <svg
          aria-hidden="true"
          viewBox="0 0 500 400"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-y-3 right-0 h-[calc(100%-1.5rem)] w-[48%]"
        >
          <path
            d="M 120 25 L 185 108 L 250 190 L 322 274 L 405 370"
            fill="none"
            stroke="var(--border)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d="M 120 25 L 185 108 L 250 190 L 322 274 L 405 370"
            fill="none"
            stroke="var(--ion)"
            strokeWidth="1.5"
            strokeDasharray={`${(visibleActive + 1) * 20} 100`}
            pathLength="100"
            vectorEffect="non-scaling-stroke"
            className="transition-[stroke-dasharray] duration-700"
          />
        </svg>

        <ol className="relative">
          {PIPELINE_STEPS.map((step, index) => {
            const isActive = index === visibleActive;
            return (
              <li key={step.name}>
                <Link
                  href={`#pipeline-${step.name.toLowerCase()}`}
                  aria-current={isActive ? "step" : undefined}
                  onFocus={() => {
                    setActive(index);
                    setPaused(true);
                  }}
                  onPointerEnter={() => setActive(index)}
                  className={cn(
                    "group grid min-h-[4.8rem] grid-cols-[2.5rem_minmax(0,1fr)_7rem] items-center gap-2 border-b border-border/70 px-2 transition-colors last:border-b-0 sm:grid-cols-[3rem_minmax(0,1fr)_8rem] sm:px-3",
                    isActive ? "bg-accent/72" : "hover:bg-accent/35",
                  )}
                >
                  <span
                    className={cn(
                      "font-mono text-[0.6875rem] tracking-[0.12em]",
                      isActive ? "text-ion" : "text-muted-foreground",
                    )}
                  >
                    {step.num}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold tracking-tight text-foreground">
                      {step.name}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                      {STAGE_COPY[index]}
                    </span>
                  </span>
                  <span className="flex min-h-[4.8rem] items-center justify-center">
                    <PageArtifact index={index} active={isActive} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-3 border-t border-border px-4 py-3 font-mono text-[0.6875rem] tracking-[0.08em] uppercase sm:grid-cols-[auto_auto_1fr] sm:px-5">
        <span className="text-ion">Active proof</span>
        <span className="text-foreground">
          {PIPELINE_STEPS[visibleActive].num} / {PIPELINE_STEPS[visibleActive].name}
        </span>
        <span className="col-span-2 mt-1 text-muted-foreground sm:col-span-1 sm:mt-0 sm:text-right">
          Brief → editable manuscript
        </span>
      </div>
    </nav>
  );
}
