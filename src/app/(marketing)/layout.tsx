import type { ReactNode } from "react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* The skip link lives once, in the root layout; this layout supplies its
          target below so it resolves without JavaScript. */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <nav
          aria-label="Main"
          className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6"
        >
          <Link href="/" className="font-display text-lg font-semibold tracking-tight">
            sopher.ai
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/#how-it-works"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "hidden text-muted-foreground sm:inline-flex",
              )}
            >
              How it works
            </Link>
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "text-muted-foreground",
              )}
            >
              Pricing
            </Link>
            <Link href="/studio" className={cn(buttonVariants({ size: "sm" }))}>
              Start your book
            </Link>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight">sopher.ai</p>
            <p className="mt-2 max-w-xs text-sm text-muted-foreground">
              A team of AI agents that turns your brief into a complete, edited manuscript.
            </p>
            <p className="mt-6 text-xs text-muted-foreground">© 2026 sopher.ai</p>
          </div>
          <nav aria-label="Footer" className="flex gap-12 sm:gap-16">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Product
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                <li>
                  <Link
                    href="/#how-it-works"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    How it works
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pricing"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/studio"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Studio
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Company
              </p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                <li>
                  <Link
                    href="/terms"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Terms
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/refunds"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Refunds
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:support@sopher.ai"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Support
                  </a>
                </li>
              </ul>
            </div>
          </nav>
        </div>
      </footer>
    </div>
  );
}
