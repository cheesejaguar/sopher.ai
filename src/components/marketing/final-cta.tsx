import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function FinalCta() {
  return (
    <section aria-labelledby="final-cta-heading" className="border-t border-border/60">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 text-center sm:py-32">
        <h2
          id="final-cta-heading"
          className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl"
        >
          The desk is set.
        </h2>
        <p className="mx-auto mt-4 max-w-md text-pretty text-muted-foreground">
          Bring the book you&apos;ve been carrying around. The agents will handle the typing.
        </p>
        <div className="mt-8">
          <Link
            href="/studio"
            className={cn(buttonVariants({ size: "lg" }), "h-11 px-6 text-base")}
          >
            Start your book
          </Link>
        </div>
      </div>
    </section>
  );
}
