import Link from "next/link";

import { BriefDemo } from "@/components/marketing/brief-demo";
import { ManuscriptRail } from "@/components/marketing/manuscript-rail";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Hero() {
  return (
    <section className="marketing-canvas marketing-hero-stage relative overflow-hidden border-b border-black/10 dark:border-white/10">
      <span
        aria-hidden="true"
        className="marketing-proof-depth-plane pointer-events-none absolute -top-20 -right-20 hidden h-[38rem] w-[28rem] border border-ion/15 opacity-55 lg:block"
      />
      <div className="relative z-10 mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-7xl items-start gap-4 px-6 py-10 lg:grid-cols-12 lg:items-center lg:gap-10 lg:px-8 lg:py-20">
        {/*
          On phones the wrapper yields its children to the hero grid so the
          promise and actions can be followed immediately by the signature
          notebook. Supporting copy remains in a logical DOM sequence, while
          every focusable element keeps the same order it has on screen.
        */}
        <div className="contents lg:col-span-6 lg:block lg:pr-8">
          <h1 className="order-1 max-w-3xl font-display text-[clamp(2.8rem,6.4vw,5.6rem)] font-semibold leading-[0.92] tracking-[-0.045em] text-balance">
            The book in your head,{" "}
            <span className="mt-2 block text-foreground">finally on the page.</span>
          </h1>
          <p className="hero-support-copy order-4 max-w-xl text-base leading-7 text-pretty text-muted-foreground lg:mt-8 sm:text-lg sm:leading-8">
            Start with a spark—a bedtime adventure, a hometown mystery, a family memory.
            Sopher&apos;s AI editorial team plans, writes, and refines the full manuscript while you
            direct every important choice.
          </p>
          <p className="folio-label order-5 text-muted-foreground lg:mt-4">
            Bedtime story / street mystery / family memoir
          </p>
          <div className="order-2 flex flex-col gap-3 sm:flex-row sm:items-center lg:mt-9">
            <Link
              href="/studio"
              prefetch={false}
              className={cn(buttonVariants({ size: "lg" }), "min-h-11 rounded-sm px-6 text-base")}
            >
              Start your book
            </Link>
            <Link
              href="#how-it-works"
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "min-h-11 rounded-sm px-5 text-base text-muted-foreground",
              )}
            >
              Watch a book take shape
              <span aria-hidden="true">↓</span>
            </Link>
          </div>
          <div className="order-6 grid max-w-xl grid-cols-[auto_1fr] gap-x-4 border-t border-black/10 pt-4 font-mono text-[0.6875rem] leading-5 tracking-[0.08em] text-muted-foreground uppercase dark:border-white/12 lg:mt-12">
            <span className="text-primary">Start with</span>
            <span>One idea only you could have</span>
            <span className="text-ion">Grow into</span>
            <span>A complete, editable story</span>
          </div>
        </div>

        <div className="relative order-3 lg:col-span-6 lg:pl-2">
          <div className="mb-5 hidden items-center justify-between border-b border-black/10 pb-3 font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase dark:border-white/12 lg:flex">
            <span>From first spark to final page</span>
            <span className="text-ion">You direct the story</span>
          </div>
          <ManuscriptRail />
        </div>
      </div>

      <div className="relative z-10 border-t border-black/10 bg-instrument/88 dark:border-white/10">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-20 lg:grid-cols-12 lg:px-8 lg:py-24">
          <div className="lg:col-span-4">
            <p className="folio-label text-primary">Proof 01 / live manuscript</p>
            <h2 className="mt-5 max-w-sm font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-balance sm:text-4xl">
              See what one idea can become.
            </h2>
            <p className="mt-5 max-w-sm leading-7 text-pretty text-muted-foreground">
              Choose a spark, then read the opening it grows into. Every example is clearly labeled
              sample material, so the story can speak for itself.
            </p>
            <p className="mt-6 max-w-sm border-l border-ion pl-4 text-sm leading-6 text-muted-foreground">
              Drafted by the Chapter Writer, then refined by the Editor.
            </p>
          </div>
          <div className="lg:col-span-8">
            <BriefDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
