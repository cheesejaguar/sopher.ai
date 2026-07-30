"use client";

import { useCallback, useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/use-reduced-motion";

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
export function BriefDemo() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState({ id: EXAMPLES[0].id, chars: 0 });
  const [paused, setPaused] = useState(false);
  // Once the reader takes control, we stop advancing on our own for good.
  const [userDriven, setUserDriven] = useState(false);

  const example = EXAMPLES[index];
  const typedChars =
    reduced || userDriven
      ? example.opening.length
      : progress.id === example.id
        ? progress.chars
        : 0;
  const complete = typedChars >= example.opening.length;
  const autoAdvancing = !reduced && !paused && !userDriven;

  // Type the current opening out. Reduced motion skips straight to the full text.
  useEffect(() => {
    if (reduced || paused || userDriven || complete) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        const base = prev.id === example.id ? prev.chars : 0;
        if (base >= example.opening.length) return prev;
        return { id: example.id, chars: Math.min(base + CHARS_PER_TICK, example.opening.length) };
      });
    }, TYPE_TICK_MS);
    return () => clearInterval(interval);
  }, [complete, example, paused, reduced, userDriven]);

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
    <div className="grid w-full gap-6 md:grid-cols-[13rem_minmax(0,1fr)] md:gap-8">
      <div className="min-w-0">
        <span className="sr-only" id="brief-demo-label">
          Example books, each written from a one-sentence brief
        </span>
        <div
          className="grid grid-cols-3 gap-px bg-black/10 dark:bg-white/10 md:grid-cols-1"
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
                "grid min-h-11 min-w-0 grid-cols-[auto_1fr] items-center gap-2 bg-[#eeeff4] px-2.5 py-2 text-left text-xs font-medium transition-colors aria-[pressed=true]:underline aria-[pressed=true]:underline-offset-4 dark:bg-[#111118] md:px-3",
                i === index
                  ? "border-l border-primary text-foreground"
                  : "border-l border-transparent text-muted-foreground hover:bg-black/[0.04] hover:text-foreground dark:hover:bg-white/[0.045]",
              )}
            >
              <span className="font-mono text-[0.6875rem] text-primary">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="min-w-0 leading-tight whitespace-normal">{item.kind}</span>
            </button>
          ))}
        </div>
        {!reduced && !userDriven ? (
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 border border-black/10 px-3 text-xs text-muted-foreground transition-colors hover:text-foreground dark:border-white/12"
            aria-label={
              paused ? "Resume cycling through examples" : "Pause cycling through examples"
            }
          >
            {paused ? (
              <Play aria-hidden="true" className="size-3" />
            ) : (
              <Pause aria-hidden="true" className="size-3" />
            )}
            <span>{paused ? "Resume" : "Pause"}</span>
          </button>
        ) : null}

        <div className="mt-6 text-left" aria-live="polite">
          <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
            The brief
          </p>
          <p className="mt-2 text-sm leading-6 text-pretty text-foreground/85">
            &ldquo;{example.brief}&rdquo;
          </p>
        </div>
      </div>

      <article className="manuscript-sheet min-w-0 px-6 py-8 text-left sm:px-10 sm:py-10">
        <div className="absolute top-0 right-6 h-5 w-16 bg-primary/80" aria-hidden="true" />
        <p className="font-sans text-[0.6875rem] font-medium tracking-[0.16em] text-paper-muted uppercase">
          {example.title} · Chapter one
        </p>
        <div className="prose-manuscript mt-5 min-h-[15rem] sm:min-h-[12rem]">
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
