import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="main-content"
      className="instrument-canvas grid min-h-dvh place-items-center px-5 py-12"
    >
      <div className="w-full max-w-3xl border border-border bg-background/95">
        <header className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-8">
          <BrandMark />
          <span className="folio-label text-muted-foreground">Route check / 404</span>
        </header>
        <div className="grid gap-10 px-5 py-12 sm:px-8 md:grid-cols-[minmax(0,1fr)_15rem] md:items-end md:py-16">
          <div>
            <p className="folio-label mb-5 text-primary">Page not registered</p>
            <h1 className="max-w-xl font-display text-4xl leading-[0.98] font-semibold tracking-[-0.035em] text-balance sm:text-6xl">
              This page isn&rsquo;t in the manuscript.
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-muted-foreground">
              The address may be mistyped, or the page may have moved. Your books and drafts are
              unaffected.
            </p>
          </div>
          <div aria-hidden="true" className="manuscript-sheet aspect-[4/5] p-6">
            <span className="font-mono text-[10px] tracking-[0.18em] text-paper-muted uppercase">
              Missing folio
            </span>
            <div className="mt-14 font-serif text-7xl leading-none text-paper-foreground/20">
              404
            </div>
            <div className="mt-8 h-px bg-paper-edge" />
            <div className="mt-3 h-px w-2/3 bg-paper-edge" />
          </div>
        </div>
        <footer className="flex flex-col gap-3 border-t border-border px-5 py-5 sm:flex-row sm:px-8">
          <Link href="/studio" className={buttonVariants()}>
            Open the studio
          </Link>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Return home
          </Link>
        </footer>
      </div>
    </main>
  );
}
