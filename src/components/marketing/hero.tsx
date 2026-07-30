import Link from "next/link";

import { BriefDemo } from "@/components/marketing/brief-demo";
import { ManuscriptRail } from "@/components/marketing/manuscript-rail";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Hero() {
  return (
    <section className="instrument-canvas relative border-b border-black/10 dark:border-white/10">
      <div className="mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-7xl items-center gap-14 px-6 py-16 lg:grid-cols-12 lg:gap-10 lg:px-8 lg:py-20">
        <div className="lg:col-span-6 lg:pr-8">
          <h1 className="max-w-3xl font-display text-[clamp(2.8rem,7vw,6rem)] font-semibold leading-[0.91] tracking-[-0.04em] text-balance">
            A sentence in. <span className="mt-2 block text-foreground">A finished book out.</span>
          </h1>
          <p className="hero-support-copy mt-8 max-w-xl text-base leading-7 text-pretty text-muted-foreground sm:text-lg sm:leading-8">
            A bedtime story where your dog is the superhero. A mystery set on your street. The
            memoir nobody in your family ever wrote down. Describe it in a sentence or two — a team
            of AI agents plans it, writes every chapter, and edits the whole manuscript while you
            watch.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="/studio"
              className={cn(buttonVariants({ size: "lg" }), "min-h-11 rounded-sm px-6 text-base")}
            >
              Write your book
            </a>
            <Link
              href="#how-it-works"
              className={cn(
                buttonVariants({ variant: "ghost", size: "lg" }),
                "min-h-11 rounded-sm px-5 text-base text-muted-foreground",
              )}
            >
              See the production line
              <span aria-hidden="true">↓</span>
            </Link>
          </div>
          <div className="mt-12 grid max-w-xl grid-cols-[auto_1fr] gap-x-4 border-t border-black/10 pt-4 font-mono text-[0.6875rem] leading-5 tracking-[0.08em] text-muted-foreground uppercase dark:border-white/12">
            <span className="text-primary">Input 01</span>
            <span>One clear brief</span>
            <span className="text-ion">Output 05</span>
            <span>A complete, editable manuscript</span>
          </div>
        </div>

        <div className="relative lg:col-span-6 lg:pl-2">
          <div className="mb-5 flex items-center justify-between border-b border-black/10 pb-3 font-mono text-[0.6875rem] tracking-[0.1em] text-muted-foreground uppercase dark:border-white/12">
            <span>Manuscript production rail</span>
            <span className="text-ion">System ready</span>
          </div>
          <ManuscriptRail />
        </div>
      </div>

      <div className="border-t border-black/10 bg-[#eeeff4]/85 dark:border-white/10 dark:bg-[#0d0d13]/92">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-20 lg:grid-cols-12 lg:px-8 lg:py-24">
          <div className="lg:col-span-4">
            <p className="folio-label text-primary">Proof 01 / live manuscript</p>
            <h2 className="mt-5 max-w-sm font-display text-3xl font-semibold leading-tight tracking-[-0.035em] text-balance sm:text-4xl">
              A sentence enters. A first page leaves.
            </h2>
            <p className="mt-5 max-w-sm leading-7 text-pretty text-muted-foreground">
              Choose a brief and inspect the opening beside it. Every example is labeled sample
              material, so you can judge the work without a sales story in the way.
            </p>
            <p className="mt-6 max-w-sm border-l border-ion pl-4 text-sm leading-6 text-muted-foreground">
              Drafted by the Chapter Writer and refined by the Editor.
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
