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
      <div className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-28">
        <h1 className="font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Guides
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-pretty text-muted-foreground">
          What the product actually does, described honestly — the stages a book goes through, what
          each setting changes, and where your judgement matters most.
        </p>

        <ul className="mt-12 divide-y divide-border border-y border-border">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link
                href={`/guides/${guide.slug}`}
                className="group block py-5 transition-colors hover:bg-accent/40"
              >
                <h2 className="font-display text-lg font-semibold tracking-tight group-hover:text-primary">
                  {guide.title}
                </h2>
                <p className="mt-1 text-sm text-pretty text-muted-foreground">{guide.standfirst}</p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
