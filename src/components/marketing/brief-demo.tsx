"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";

type Example = {
  id: string;
  kind: string;
  title: string;
  brief: string;
  opening: string;
};

/** Three briefs a publisher would never print — which is the whole point. */
const EXAMPLES: Example[] = [
  {
    id: "bedtime",
    kind: "Bedtime story",
    title: "Biscuit Saves Trash Day",
    brief:
      "A bedtime story for Maya, age 6 — our beagle Biscuit gets superpowers, but only on trash day.",
    opening:
      "Biscuit was an ordinary beagle six days a week. But on Tuesday mornings, when the trash truck groaned down Alder Street, his ears went stiff as sails, his nose went hot as a kettle, and his short brown legs filled up with a feeling he could only call zoom.",
  },
  {
    id: "mystery",
    kind: "Mystery",
    title: "Nine Panes",
    brief: "A locked-room mystery set in my hometown, with a tired harbor pilot as the detective.",
    opening:
      "The door had been bolted from the inside, which was the first impossible thing. Cass Renner had steered freighters through worse fog than the story she was being told, so she set down her cold coffee and counted the window panes. Nine. Every one painted shut, for years.",
  },
  {
    id: "memoir",
    kind: "Family memoir",
    title: "Dear Ruth",
    brief:
      "My grandfather's year on a fishing trawler in 1961, written from the letters he mailed home.",
    opening:
      "He wrote to her every Sunday, whether or not there was a port to mail from, and the letters stacked up in the wheelhouse like a debt he meant to pay all at once. Dear Ruth, each one began. The sea today was the color of our kitchen floor.",
  },
];

const TYPE_TICK_MS = 18;
const CHARS_PER_TICK = 3;
const HOLD_MS = 4200;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

export function BriefDemo() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState({ id: EXAMPLES[0].id, chars: 0 });
  const [paused, setPaused] = useState(false);
  // Once the reader takes control, we stop advancing on our own for good.
  const [userDriven, setUserDriven] = useState(false);

  const example = EXAMPLES[index];
  const typedChars = reduced
    ? example.opening.length
    : progress.id === example.id
      ? progress.chars
      : 0;
  const complete = typedChars >= example.opening.length;
  const autoAdvancing = !reduced && !paused && !userDriven;

  // Type the current opening out. Reduced motion skips straight to the full text.
  useEffect(() => {
    if (reduced) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        const base = prev.id === example.id ? prev.chars : 0;
        return { id: example.id, chars: Math.min(base + CHARS_PER_TICK, example.opening.length) };
      });
    }, TYPE_TICK_MS);
    return () => clearInterval(interval);
  }, [example, reduced]);

  // Hold the finished passage briefly, then move to the next brief.
  useEffect(() => {
    if (!autoAdvancing || !complete) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % EXAMPLES.length), HOLD_MS);
    return () => clearTimeout(timer);
  }, [autoAdvancing, complete, index]);

  const choose = useCallback((next: number) => {
    setUserDriven(true);
    setIndex(next);
  }, []);

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="sr-only" id="brief-demo-label">
          Example books, each written from a one-sentence brief
        </span>
        <div
          className="flex flex-wrap justify-center gap-1.5"
          role="group"
          aria-labelledby="brief-demo-label"
        >
          {EXAMPLES.map((item, i) => (
            <button
              key={item.id}
              type="button"
              onClick={() => choose(i)}
              aria-pressed={i === index}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                i === index
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {item.kind}
            </button>
          ))}
        </div>
        {!reduced && !userDriven ? (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="inline-flex size-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
            aria-label={
              paused ? "Resume cycling through examples" : "Pause cycling through examples"
            }
          >
            {paused ? (
              <Play aria-hidden="true" className="size-3" />
            ) : (
              <Pause aria-hidden="true" className="size-3" />
            )}
          </button>
        ) : null}
      </div>

      <div className="mt-5 text-left">
        <p className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
          The brief
        </p>
        <p className="mt-1.5 text-sm text-pretty text-foreground/85 sm:text-base">
          &ldquo;{example.brief}&rdquo;
        </p>
      </div>

      <article className="paper-surface glow-primary mt-4 px-6 py-7 text-left sm:px-9 sm:py-8">
        <p className="font-sans text-[0.65rem] font-medium tracking-[0.2em] text-paper-muted uppercase">
          {example.title} · Chapter one
        </p>
        <div className="prose-manuscript mt-4 min-h-[12.5rem] sm:min-h-[9.5rem]">
          <div className="relative">
            {/* Invisible full passage reserves the final height so nothing jumps while typing. */}
            <p aria-hidden="true" className="invisible" style={{ marginBlock: 0 }}>
              {example.opening}
            </p>
            <p
              aria-hidden="true"
              className={cn("absolute inset-0", complete ? "" : "stream-caret")}
              style={{ marginBlock: 0 }}
            >
              {example.opening.slice(0, typedChars)}
            </p>
            {/* Screen readers get the finished passage, never the character-by-character churn. */}
            <p className="sr-only">
              {example.title}, chapter one. {example.opening}
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}
