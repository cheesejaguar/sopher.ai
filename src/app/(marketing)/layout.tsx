import type { ReactNode } from "react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { MobileMainMenu } from "@/components/marketing/mobile-main-menu";
import { PublicAnalytics } from "@/components/marketing/public-analytics";
import { PublicNavLink } from "@/components/marketing/public-nav-link";
import { PublicThemeToggle } from "@/components/marketing/public-theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const vercelAnalyticsEnabled = process.env.VERCEL === "1";

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground [--font-serif:Georgia] [font-family:var(--font-archivo),Arial,sans-serif]">
      <PublicAnalytics gaId={gaId} vercelEnabled={vercelAnalyticsEnabled} />
      {/* The skip link lives once, in the root layout; this layout supplies its
          target below so it resolves without JavaScript. */}
      <header className="sticky top-0 z-40 border-b border-black/10 bg-background/95 backdrop-blur-xl dark:border-white/10">
        <nav
          aria-label="Main"
          className="mx-auto flex h-16 w-full max-w-7xl items-center gap-2 px-4 min-[360px]:gap-4 sm:px-6 lg:px-8"
        >
          <PublicNavLink
            href="/"
            aria-label="sopher.ai"
            currentClassName="border-primary"
            className="group flex min-h-11 items-center border-b border-transparent"
          >
            <BrandMark showWordmark={false} className="sm:hidden" />
            <BrandMark className="hidden sm:inline-flex" />
          </PublicNavLink>
          <div className="ml-auto hidden items-center gap-1 md:flex">
            <PublicNavLink
              href="/#how-it-works"
              match="none"
              className="inline-flex min-h-11 items-center border-b border-transparent px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              How it works
            </PublicNavLink>
            <PublicNavLink
              href="/genres"
              match="section"
              currentClassName="border-primary text-foreground"
              className="inline-flex min-h-11 items-center border-b border-transparent px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              Genres
            </PublicNavLink>
            <PublicNavLink
              href="/guides"
              match="section"
              currentClassName="border-primary text-foreground"
              className="inline-flex min-h-11 items-center border-b border-transparent px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              Guides
            </PublicNavLink>
            <PublicNavLink
              href="/pricing"
              currentClassName="border-primary text-foreground"
              className="inline-flex min-h-11 items-center border-b border-transparent px-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              Pricing
            </PublicNavLink>
          </div>
          <Link
            href="/studio"
            prefetch={false}
            className={cn(buttonVariants(), "ml-auto min-h-11 rounded-sm px-4 md:ml-3")}
          >
            Start your book
          </Link>
          <div className="[&_[data-slot=button]]:size-11 [&_[data-slot=button]]:rounded-sm">
            <PublicThemeToggle />
          </div>
          <MobileMainMenu />
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="border-t border-black/10 dark:border-white/10">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-14 sm:grid-cols-2 lg:grid-cols-12 lg:px-8 lg:py-20">
          <div className="lg:col-span-5">
            <p>
              <BrandMark />
            </p>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Turn the story in your head into a complete, editable manuscript while every stage
              stays visible.
            </p>
            <p className="mt-8 font-mono text-[0.6875rem] tracking-[0.12em] text-muted-foreground uppercase">
              © 2026 sopher.ai · Future proof 01
            </p>
          </div>
          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 lg:col-span-7 lg:grid-cols-3">
            <div className="border-t border-black/10 pt-4 dark:border-white/10">
              <p className="font-mono text-[0.6875rem] tracking-[0.16em] text-muted-foreground uppercase">
                Product
              </p>
              <ul className="mt-4 flex flex-col gap-1 text-sm">
                <li>
                  <Link
                    href="/#how-it-works"
                    className="flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
                  >
                    How it works
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pricing"
                    className="flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
                  >
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link
                    href="/genres"
                    className="flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
                  >
                    Genres
                  </Link>
                </li>
                <li>
                  <Link
                    href="/guides"
                    className="flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
                  >
                    Guides
                  </Link>
                </li>
                <li>
                  <Link
                    href="/studio"
                    prefetch={false}
                    className="flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
                  >
                    Studio
                  </Link>
                </li>
              </ul>
            </div>
            <div className="border-t border-black/10 pt-4 dark:border-white/10">
              <p className="font-mono text-[0.6875rem] tracking-[0.16em] text-muted-foreground uppercase">
                Terms
              </p>
              <ul className="mt-4 flex flex-col gap-1 text-sm">
                <li>
                  <Link
                    href="/terms"
                    className="flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
                  >
                    Terms
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/refunds"
                    className="flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
                  >
                    Refunds
                  </Link>
                </li>
                <li>
                  <a
                    href="mailto:support@sopher.ai"
                    className="flex min-h-11 items-center text-muted-foreground transition-colors hover:text-foreground sm:min-h-9"
                  >
                    Support
                  </a>
                </li>
              </ul>
            </div>
            <div className="col-span-2 border-t border-black/10 pt-4 dark:border-white/10 lg:col-span-1">
              <p className="font-mono text-[0.65rem] tracking-[0.16em] text-muted-foreground uppercase">
                Sequence
              </p>
              <ol className="mt-4 grid grid-cols-5 gap-1 lg:grid-cols-1">
                {["Concept", "Outline", "Chapters", "Editor", "Continuity"].map((stage, index) => (
                  <li key={stage} className="text-xs text-muted-foreground">
                    <span className="mr-2 hidden font-mono text-[0.6875rem] text-primary lg:inline">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="max-lg:sr-only">{stage}</span>
                    <span
                      aria-hidden="true"
                      className="block h-px bg-primary/40 lg:hidden"
                      style={{ opacity: 0.35 + index * 0.15 }}
                    />
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        </div>
      </footer>
    </div>
  );
}
