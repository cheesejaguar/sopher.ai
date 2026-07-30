import type { Metadata } from "next";
import Link from "next/link";

import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { GENRE_PAGES } from "@/lib/marketing/genre-pages";
import { publicPageMetadata } from "@/lib/marketing/public-metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Genres",
  description:
    "Romance, mystery, fantasy, thriller, literary fiction, science fiction, horror — what each genre needs structurally, and how sopher.ai plans for it.",
  path: "/genres",
});

export default function GenresIndex() {
  return (
    <>
      <BreadcrumbJsonLd trail={[{ name: "Genres", path: "/genres" }]} />

      <header className="marketing-canvas border-b border-black/10 dark:border-white/10">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-20 lg:grid-cols-12 lg:px-8 lg:py-28">
          <div className="lg:col-span-4">
            <p className="folio-label text-primary">Structural library / 07 genres</p>
          </div>
          <div className="lg:col-span-8">
            <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-balance sm:text-6xl">
              Every genre has its own rules
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-pretty text-muted-foreground">
              A mystery is broken by a clue that arrives after the reveal. A romance is broken by a
              conflict a single conversation would fix. The outline is planned against the
              genre&rsquo;s actual structure before a word is drafted, which is what makes the
              difference.
            </p>
          </div>
        </div>
      </header>

      <section aria-labelledby="genre-index-heading">
        <div className="mx-auto w-full max-w-7xl px-6 py-20 lg:px-8 lg:py-28">
          <div className="flex items-end justify-between gap-6 border-b border-black/10 pb-4 dark:border-white/10">
            <h2 id="genre-index-heading" className="font-display text-2xl font-semibold">
              Choose a production profile
            </h2>
            <span className="hidden font-mono text-[0.6875rem] tracking-[0.08em] text-muted-foreground uppercase sm:block">
              Elements / subgenres
            </span>
          </div>

          <ul className="border-b border-black/10 dark:border-white/10">
            {GENRE_PAGES.map((page, index) => (
              <li key={page.id}>
                <Link
                  href={`/genres/${page.slug}`}
                  className="group grid min-h-32 gap-4 border-b border-black/10 py-6 last:border-b-0 hover:bg-black/[0.025] dark:border-white/10 dark:hover:bg-white/[0.025] sm:grid-cols-[4rem_minmax(10rem,0.7fr)_1.3fr_auto] sm:items-start sm:px-3"
                >
                  <span className="font-mono text-xs tracking-[0.12em] text-primary sm:pt-1">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 className="font-display text-2xl font-semibold tracking-[-0.025em] group-hover:text-primary">
                    {page.name}
                  </h3>
                  <p className="max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
                    {page.description}
                  </p>
                  <span className="flex items-center gap-4 sm:block sm:text-right">
                    <span className="block font-mono text-[0.6875rem] leading-5 tracking-[0.08em] text-muted-foreground uppercase">
                      {page.coreElements.length} elements
                      <br />
                      {page.subgenres.length} subgenres
                    </span>
                    <span
                      aria-hidden="true"
                      className="mt-3 inline-block text-lg text-primary transition-transform group-hover:translate-x-1"
                    >
                      →
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-12 grid gap-6 border-l border-primary pl-5 sm:grid-cols-[1fr_auto] sm:items-center sm:pl-8">
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Genre guidance shapes the outline; your brief still decides the setting, people,
              voice, and direction of the book.
            </p>
            <a
              href="/studio"
              className="inline-flex min-h-11 items-center justify-center border border-black/15 px-5 text-sm font-medium hover:bg-black/[0.035] dark:border-white/15 dark:hover:bg-white/[0.04]"
            >
              Start from your brief
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
