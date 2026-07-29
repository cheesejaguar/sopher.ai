import type { Metadata } from "next";
import Link from "next/link";

import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { GENRE_PAGES } from "@/lib/marketing/genre-pages";

export const metadata: Metadata = {
  title: "Genres",
  description:
    "Romance, mystery, fantasy, thriller, literary fiction, science fiction, horror — what each genre needs structurally, and how sopher.ai plans for it.",
  alternates: { canonical: "/genres" },
};

export default function GenresIndex() {
  return (
    <>
      <BreadcrumbJsonLd trail={[{ name: "Genres", path: "/genres" }]} />
      <div className="mx-auto w-full max-w-4xl px-6 py-20 sm:py-28">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Every genre has its own rules
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
          A mystery is broken by a clue that arrives after the reveal. A romance is broken by a
          conflict a single conversation would fix. The outline is planned against the genre&rsquo;s
          actual structure before a word is drafted, which is what makes the difference.
        </p>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {GENRE_PAGES.map((page) => (
            <li key={page.id}>
              <Link
                href={`/genres/${page.slug}`}
                className="block h-full rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/25"
              >
                <h2 className="font-display text-lg font-semibold tracking-tight">{page.name}</h2>
                <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
                  {page.description}
                </p>
                <p className="mt-3 font-mono text-[0.68rem] tracking-[0.12em] text-muted-foreground uppercase">
                  {page.coreElements.length} structural elements · {page.subgenres.length} subgenres
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
