import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCta() {
  return (
    <section
      aria-labelledby="final-cta-heading"
      className="defer-offscreen defer-final relative border-y border-white/10 bg-future-stage text-future-stage-foreground"
    >
      <span
        aria-hidden="true"
        className="spectral-rule marketing-final-rule absolute top-0 left-0 h-px w-48 max-w-full sm:w-72"
      />
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-16 sm:gap-9 sm:px-6 sm:py-24 lg:grid-cols-12 lg:items-end lg:px-8">
        <div className="min-w-0 lg:col-span-8">
          <p className="folio-label text-future-stage-accent">Next action / brief 01</p>
          <h2
            id="final-cta-heading"
            className="mt-5 min-w-0 max-w-full font-display text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-balance sm:max-w-3xl sm:text-6xl"
          >
            Bring the story you keep coming back to.
          </h2>
          <p className="mt-5 max-w-xl text-pretty text-future-stage-muted">
            Start with the spark. Follow every stage. Leave with a complete manuscript you can keep
            shaping in your own voice.
          </p>
        </div>
        <div className="min-w-0 lg:col-span-4 lg:flex lg:justify-end">
          <Link
            href="/studio"
            prefetch={false}
            className={cn(
              buttonVariants({ size: "lg" }),
              "min-h-12 w-full rounded-sm bg-future-stage-action px-7 text-base text-future-stage-foreground hover:bg-future-stage-action-hover sm:w-auto",
            )}
          >
            Start your book
          </Link>
        </div>
      </div>
    </section>
  );
}
