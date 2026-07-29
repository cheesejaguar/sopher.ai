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
    <article className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-balance">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
      <div className="prose-legal mt-8 space-y-6 text-[0.95rem] leading-relaxed [&_h2]:mt-10 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 [&_strong]:text-foreground">
        {children}
      </div>
    </article>
  );
}
