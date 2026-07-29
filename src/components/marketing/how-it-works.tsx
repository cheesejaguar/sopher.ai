"use client";

import { useEffect, useRef, useState } from "react";

import { PIPELINE_STEPS as STEPS } from "./content";

const STAGGER_MS = 150;

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [inked, setInked] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          if (reduced) setReducedMotion(true);
          setInked(true);
          observer.disconnect();
        }
      },
      // Reduced motion: fill as soon as any part of the section is visible.
      { threshold: reduced ? 0 : 0.15 },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-20"
    >
      <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">How it works</p>
          <h2
            id="how-it-works-heading"
            className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            Five agents. One pass of ink.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Your brief moves through a pipeline of specialists, the way a manuscript moves through a
            publishing house — except the whole house works at once.
          </p>
        </div>

        <ol className="mt-14 grid gap-8 md:grid-cols-5 md:gap-4 lg:gap-6">
          {STEPS.map((step, index) => (
            <li key={step.name} className="flex gap-4 md:flex-col md:gap-5">
              {/* Decorative spine: fills with ink as the pipeline is described.
                  The two bands are the raised ridges of a hardcover spine. */}
              <div
                aria-hidden="true"
                className="relative w-2 shrink-0 self-stretch overflow-hidden rounded-full border border-border bg-card md:h-20 md:w-full md:self-auto md:rounded-lg"
              >
                <div
                  className="absolute inset-0 origin-bottom bg-primary motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
                  style={{
                    transform: inked ? "scaleY(1)" : "scaleY(0)",
                    transitionDelay: reducedMotion ? "0ms" : `${index * STAGGER_MS}ms`,
                  }}
                />
                <span className="absolute inset-x-0 top-[22%] hidden h-px bg-primary-foreground/30 md:block" />
                <span className="absolute inset-x-0 bottom-[22%] hidden h-px bg-primary-foreground/30 md:block" />
              </div>
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-baseline gap-x-2 font-sans text-base font-semibold">
                  <span className="font-mono text-xs font-normal text-muted-foreground">
                    {step.num}
                  </span>
                  {step.name}
                  {step.note ? (
                    <span className="rounded-full bg-ai-soft px-2 py-0.5 font-sans text-[0.68rem] font-medium text-ai">
                      {step.note}
                    </span>
                  ) : null}
                </h3>
                <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
