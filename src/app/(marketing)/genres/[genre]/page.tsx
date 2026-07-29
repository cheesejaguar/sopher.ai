import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { BreadcrumbJsonLd, FaqJsonLd, SITE_URL } from "@/components/seo/json-ld";
import { GENRE_PAGES, getGenrePage } from "@/lib/marketing/genre-pages";
import { cn } from "@/lib/utils";

/**
 * Genre landing pages.
 *
 * The site had five public pages and about 2,400 words, more than half of it
 * legal boilerplate — nothing for search to rank and nothing for an answer
 * engine to cite. These are the seven pages the product already had the
 * knowledge to write honestly: the craft content comes from the same templates
 * the outliner uses, so the page describes what the product actually does.
 */

export function generateStaticParams() {
  return GENRE_PAGES.map((page) => ({ genre: page.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ genre: string }>;
}): Promise<Metadata> {
  const { genre } = await params;
  const page = getGenrePage(genre);
  if (!page) return {};
  return {
    title: `${page.heading} with AI`,
    description: page.metaDescription,
    alternates: { canonical: `/genres/${page.slug}` },
    openGraph: {
      title: `${page.heading} with AI · sopher.ai`,
      description: page.metaDescription,
      url: `${SITE_URL}/genres/${page.slug}`,
    },
  };
}

export default async function GenrePage({ params }: { params: Promise<{ genre: string }> }) {
  const { genre } = await params;
  const page = getGenrePage(genre);
  if (!page) notFound();

  const others = GENRE_PAGES.filter((other) => other.id !== page.id);

  return (
    <>
      <FaqJsonLd items={page.faqs} />
      <BreadcrumbJsonLd
        trail={[
          { name: "Genres", path: "/genres" },
          { name: page.name, path: `/genres/${page.slug}` },
        ]}
      />

      <article className="mx-auto w-full max-w-3xl px-6 py-20 sm:py-28">
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">{page.name}</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {page.heading} with AI
        </h1>

        <div className="mt-8 space-y-5 text-lg text-pretty text-muted-foreground">
          {page.intro.map((paragraph) => (
            <p key={paragraph.slice(0, 32)}>{paragraph}</p>
          ))}
        </div>

        <p className="mt-8">
          <Link
            href={`/studio/new?genre=${page.id}`}
            className={cn(buttonVariants({ size: "lg" }))}
          >
            Start a {page.name.toLowerCase()} book
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </p>

        <section aria-labelledby="elements-heading" className="mt-16">
          <h2 id="elements-heading" className="font-display text-2xl font-semibold tracking-tight">
            What a {page.name.toLowerCase()} book needs
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            These are the structural elements the outliner plans for, and where each one belongs.
          </p>
          <dl className="mt-6 space-y-5">
            {page.coreElements.map((element) => (
              <div key={element.name}>
                <dt className="font-medium">
                  {element.name}
                  <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                    {element.whenToInclude}
                  </span>
                </dt>
                <dd className="mt-1 text-sm text-pretty text-muted-foreground">
                  {element.description}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="expect-heading" className="mt-14">
          <h2 id="expect-heading" className="font-display text-2xl font-semibold tracking-tight">
            What {page.name.toLowerCase()} readers expect
          </h2>
          <ul className="mt-5 space-y-2 text-muted-foreground">
            {page.readerExpectations.map((expectation) => (
              <li key={expectation} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ai" />
                <span className="text-pretty">{expectation}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-pretty text-muted-foreground">
            <strong className="font-medium text-foreground">Pacing.</strong> {page.pacingNotes}
          </p>
        </section>

        <section aria-labelledby="sub-heading" className="mt-14">
          <h2 id="sub-heading" className="font-display text-2xl font-semibold tracking-tight">
            Subgenres and tropes
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Pick a subgenre in the wizard and the structural guidance adapts to it.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {page.subgenres.map((subgenre) => (
              <li
                key={subgenre}
                className="rounded-full border border-border px-3 py-1 text-sm text-muted-foreground"
              >
                {subgenre}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-pretty text-muted-foreground">
            Familiar territory the genre draws on: {page.commonTropes.join(", ")}. Ask for them or
            ask for something else — the brief decides.
          </p>
        </section>

        <section aria-labelledby="faq-heading" className="mt-14">
          <h2 id="faq-heading" className="font-display text-2xl font-semibold tracking-tight">
            Questions about {page.name.toLowerCase()}
          </h2>
          <dl className="mt-6 space-y-6">
            {page.faqs.map((faq) => (
              <div key={faq.question}>
                <dt className="font-medium">{faq.question}</dt>
                <dd className="mt-1.5 text-sm text-pretty text-muted-foreground">{faq.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="other-heading" className="mt-16 border-t border-border pt-8">
          <h2 id="other-heading" className="font-sans text-sm font-semibold">
            Other genres
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {others.map((other) => (
              <li key={other.id}>
                <Link href={`/genres/${other.slug}`} className="text-primary hover:underline">
                  {other.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/guides" className="text-primary hover:underline">
                Guides
              </Link>
            </li>
            <li>
              <Link href="/pricing" className="text-primary hover:underline">
                Pricing
              </Link>
            </li>
          </ul>
        </section>
      </article>
    </>
  );
}
