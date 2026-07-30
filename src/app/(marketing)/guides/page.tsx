import type { Metadata } from "next";
import Link from "next/link";

import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { GUIDES } from "@/lib/marketing/guides";

export const metadata: Metadata = {
  title: "Guides",
  description:
    "How book generation works, choosing a quality tier, point of view and tense, content settings, and what the editorial pass checks.",
  alternates: { canonical: "/guides" },
};

export default function GuidesIndex() {
  return (
    <>
      <BreadcrumbJsonLd trail={[{ name: "Guides", path: "/guides" }]} />

      <header className="story-notebook-canvas border-b border-black/10 dark:border-white/10">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-20 lg:grid-cols-12 lg:px-8 lg:py-28">
          <div className="lg:col-span-4">
            <p className="folio-label text-primary">Field manual / 05 guides</p>
          </div>
          <div className="lg:col-span-8">
            <h1 className="font-display text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-balance sm:text-6xl">
              Guides
            </h1>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-pretty text-muted-foreground">
              What the product actually does, described honestly — the stages a book goes through,
              what each setting changes, and where your judgement matters most.
            </p>
          </div>
        </div>
      </header>

      <section aria-labelledby="guide-index-heading">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-20 lg:grid-cols-12 lg:px-8 lg:py-28">
          <div className="lg:col-span-4">
            <div className="border-l border-[color:var(--notebook-margin)] pl-5 lg:sticky lg:top-28">
              <h2 id="guide-index-heading" className="font-display text-2xl font-semibold">
                Find the guide you need
              </h2>
              <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
                Follow the full path from premise to polished manuscript, or jump directly to the
                choice in front of you.
              </p>
              <p className="folio-label mt-7 text-muted-foreground">Five guides / one clear path</p>
            </div>
          </div>

          <ol className="border-y border-black/10 dark:border-white/10 lg:col-span-8">
            {GUIDES.map((guide, index) => (
              <li key={guide.slug}>
                <Link
                  href={`/guides/${guide.slug}`}
                  className="group grid min-h-28 grid-cols-[3rem_1fr_auto] gap-3 border-b border-black/10 py-6 last:border-b-0 dark:border-white/10 sm:grid-cols-[4rem_1fr_auto] sm:px-3"
                >
                  <span className="font-mono text-xs tracking-[0.12em] text-primary sm:pt-1">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <span className="block font-display text-xl font-semibold tracking-[-0.02em] group-hover:text-primary sm:text-2xl">
                      {guide.title}
                    </span>
                    <span className="mt-2 block max-w-2xl text-sm leading-6 text-pretty text-muted-foreground">
                      {guide.standfirst}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="pt-1 text-lg text-primary transition-transform group-hover:translate-x-1"
                  >
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
