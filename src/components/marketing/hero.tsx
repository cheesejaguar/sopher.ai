import Link from "next/link";

import { TypewriterPage } from "@/components/marketing/typewriter-page";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Hero() {
  return (
    <section className="marketing-aurora relative overflow-hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-20 pb-16 text-center sm:pt-28 sm:pb-24">
        <h1 className="max-w-3xl font-display text-5xl font-semibold tracking-tight text-balance sm:text-6xl md:text-7xl">
          Your brief. A finished book.
        </h1>
        <p className="mt-6 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
          Describe the book you want to exist. A team of AI agents develops the concept, outlines
          the story, drafts every chapter in parallel, then edits and continuity-checks the whole
          manuscript — while you watch it happen.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/studio"
            className={cn(buttonVariants({ size: "lg" }), "h-11 px-6 text-base")}
          >
            Start your book
          </Link>
          <Link
            href="#how-it-works"
            className={cn(
              buttonVariants({ variant: "ghost", size: "lg" }),
              "h-11 px-6 text-base text-muted-foreground",
            )}
          >
            See how it works
          </Link>
        </div>
        <div className="mt-14 w-full max-w-2xl sm:mt-16">
          <TypewriterPage />
          <p className="mt-4 font-sans text-xs text-muted-foreground sm:text-sm">
            Drafted by the <span className="text-ai">Chapter Writer</span> · edited by the{" "}
            <span className="text-ai">Editor</span>
          </p>
        </div>
      </div>
    </section>
  );
}
