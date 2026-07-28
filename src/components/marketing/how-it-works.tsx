"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Step = {
  num: string;
  name: string;
  spineLabel: string;
  description: string;
};

const STEPS: Step[] = [
  {
    num: "01",
    name: "Concept",
    spineLabel: "Concept",
    description:
      "Reads your brief and develops the premise, world, and cast into a concept worth writing.",
  },
  {
    num: "02",
    name: "Outline",
    spineLabel: "Outline",
    description:
      "Structures the story into a chapter-by-chapter plan with arcs, beats, and payoffs.",
  },
  {
    num: "03",
    name: "Chapters",
    spineLabel: "Chapters ∥",
    description:
      "A team of writers drafts every chapter in parallel, each following the outline and your style guide.",
  },
  {
    num: "04",
    name: "Editor",
    spineLabel: "Editor",
    description: "Critiques and rewrites each chapter for pacing, voice, and prose quality.",
  },
  {
    num: "05",
    name: "Continuity",
    spineLabel: "Continuity",
    description:
      "Checks names, timelines, and details across the whole manuscript before it ships.",
  },
];

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
            <li key={step.name} className="flex gap-4 md:flex-col md:gap-4">
              <div
                aria-hidden="true"
                className="relative w-2 shrink-0 self-stretch overflow-hidden rounded-full border border-border bg-card md:h-52 md:w-full md:self-auto md:rounded-lg"
              >
                <div
                  className="absolute inset-0 origin-bottom bg-primary motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out"
                  style={{
                    transform: inked ? "scaleY(1)" : "scaleY(0)",
                    transitionDelay: reducedMotion ? "0ms" : `${index * STAGGER_MS}ms`,
                  }}
                />
                <span
                  className={cn(
                    "absolute bottom-4 left-1/2 hidden -translate-x-1/2 rotate-180 font-display text-lg font-medium tracking-wide transition-colors duration-300 md:block [writing-mode:vertical-rl]",
                    inked ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                  style={{
                    transitionDelay: reducedMotion ? "0ms" : `${index * STAGGER_MS + 200}ms`,
                  }}
                >
                  {step.spineLabel}
                </span>
              </div>
              <div className="min-w-0">
                <h3 className="font-sans text-sm font-semibold">
                  <span className="mr-1.5 font-mono text-xs font-normal text-muted-foreground">
                    {step.num}
                  </span>
                  {step.name}
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
