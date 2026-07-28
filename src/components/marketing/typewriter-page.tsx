"use client";

import { useEffect, useState } from "react";

const PASSAGE =
  "The lamplighter came to Vhail at dusk, as she had every dusk for sixty years, though the city had long forgotten why. She touched her taper to the first cold lamp, and far beneath the streets something old and patient opened one eye.";

const START_DELAY_MS = 500;
const TICK_MS = 22;
const CHARS_PER_TICK = 2;

export function TypewriterPage() {
  const [chars, setChars] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let interval: ReturnType<typeof setInterval> | undefined;
    const delay = setTimeout(
      () => {
        if (reducedMotion) {
          setChars(PASSAGE.length);
          setDone(true);
          return;
        }
        let written = 0;
        interval = setInterval(() => {
          written = Math.min(written + CHARS_PER_TICK, PASSAGE.length);
          setChars(written);
          if (written === PASSAGE.length) {
            clearInterval(interval);
            setDone(true);
          }
        }, TICK_MS);
      },
      reducedMotion ? 0 : START_DELAY_MS,
    );
    return () => {
      clearTimeout(delay);
      if (interval) clearInterval(interval);
    };
  }, []);

  return (
    <article className="paper-surface glow-primary px-6 py-8 text-left sm:px-10 sm:py-10">
      <p className="font-sans text-[0.65rem] font-medium tracking-[0.2em] text-paper-muted uppercase">
        The Lamplighter&apos;s Oath · Chapter one
      </p>
      <div className="prose-manuscript mt-5">
        <div className="relative">
          {/* Invisible full passage reserves the final layout, so nothing shifts while typing. */}
          <p aria-hidden="true" className="invisible" style={{ marginBlock: 0 }}>
            {PASSAGE}
          </p>
          <p
            aria-hidden="true"
            className={`absolute inset-0 ${done ? "" : "stream-caret"}`}
            style={{ marginBlock: 0 }}
          >
            {PASSAGE.slice(0, chars)}
          </p>
          <p className="sr-only">{PASSAGE}</p>
        </div>
      </div>
    </article>
  );
}
