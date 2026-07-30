import type { ReactNode } from "react";

/**
 * Shared shell for the legal pages: a quiet reading column, no marketing
 * chrome beyond the site's own header/footer, dates stated plainly.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="marketing-canvas border-b border-black/10 dark:border-white/10">
      <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-16 lg:grid-cols-12 lg:px-8 lg:py-24">
        <header className="lg:col-span-4">
          <p className="folio-label text-primary">Legal record / published</p>
          <h1 className="mt-5 max-w-sm font-display text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-balance sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 font-mono text-[0.6875rem] tracking-[0.06em] text-muted-foreground uppercase">
            Last updated {updated}
          </p>
          <div
            aria-hidden="true"
            className="mt-8 hidden h-px w-24 bg-gradient-to-r from-primary to-ion lg:block"
          />
        </header>

        <div className="manuscript-sheet px-6 py-10 sm:px-10 sm:py-12 lg:col-span-8 lg:px-14 lg:py-16">
          <span aria-hidden="true" className="absolute top-0 right-8 h-6 w-24 bg-primary/75" />
          <div className="prose-legal mx-auto max-w-[72ch] space-y-6 font-serif text-[1rem] leading-7 text-paper-muted [&_a]:text-paper-link [&_a]:underline-offset-4 hover:[&_a]:underline [&_code]:font-mono [&_code]:text-[0.86em] [&_h2]:mt-12 [&_h2]:font-sans [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-[-0.025em] [&_h2]:text-paper-foreground [&_li]:text-paper-muted [&_p]:text-paper-muted [&_strong]:font-semibold [&_strong]:text-paper-foreground [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
            {children}
          </div>
          <p className="mt-12 flex items-center justify-between border-t border-paper-edge pt-4 font-mono text-[0.6875rem] tracking-[0.08em] text-paper-muted uppercase">
            <span>sopher.ai / legal</span>
            <span>01</span>
          </p>
        </div>
      </div>
    </article>
  );
}
