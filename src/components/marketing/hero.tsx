import Link from "next/link";

import { BriefDemo } from "@/components/marketing/brief-demo";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Hero() {
  return (
    <section className="marketing-aurora relative overflow-hidden">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 pt-20 pb-16 text-center sm:pt-28 sm:pb-24">
        <h1 className="max-w-4xl font-display text-4xl font-semibold tracking-tight text-balance sm:text-6xl md:text-7xl">
          Any book you can imagine.{" "}
          <span className="block text-primary sm:inline">Made for the people you love.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-base text-pretty text-muted-foreground sm:text-lg">
          A bedtime story where your dog is the superhero. A mystery set on your street. The memoir
          nobody in your family ever wrote down. Describe it in a sentence or two — a team of AI
          agents plans it, writes every chapter, and edits the whole manuscript while you watch.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/studio"
            className={cn(buttonVariants({ size: "lg" }), "h-11 px-6 text-base")}
          >
            Write your book
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
          <BriefDemo />
          <p className="mt-4 font-sans text-xs text-muted-foreground sm:text-sm">
            Every example above was written from the brief beside it — drafted by the{" "}
            <span className="text-ai">Chapter Writer</span>, edited by the{" "}
            <span className="text-ai">Editor</span>.
          </p>
        </div>
      </div>
    </section>
  );
}
