import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";

import { BreadcrumbJsonLd, FaqJsonLd, SITE_URL } from "@/components/seo/json-ld";
import { buttonVariants } from "@/components/ui/button";
import { GENRE_PAGES, getGenrePage } from "@/lib/marketing/genre-pages";
import { cn } from "@/lib/utils";

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

      <article>
        <header className="instrument-canvas border-b border-black/10 dark:border-white/10">
          <div className="mx-auto grid w-full max-w-7xl gap-8 px-6 py-16 lg:grid-cols-12 lg:px-8 lg:py-24">
            <div className="lg:col-span-3">
              <nav aria-label="Breadcrumb">
                <ol className="folio-label flex flex-wrap items-center gap-2 text-primary">
                  <li>
                    <Link
                      href="/genres"
                      className="inline-flex min-h-11 items-center hover:underline"
                    >
                      Genres
                    </Link>
                  </li>
                  <li aria-hidden="true">/</li>
                  <li aria-current="page" className="text-muted-foreground">
                    {page.name}
                  </li>
                </ol>
              </nav>
            </div>
            <div className="lg:col-span-8">
              <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-balance sm:text-6xl">
                {page.heading} with AI
              </h1>
              <div className="mt-7 max-w-3xl space-y-5 text-lg leading-8 text-pretty text-muted-foreground">
                {page.intro.map((paragraph) => (
                  <p key={paragraph.slice(0, 32)}>{paragraph}</p>
                ))}
              </div>
              <p className="mt-9">
                <a
                  href={`/studio/new?genre=${page.id}`}
                  className={cn(buttonVariants({ size: "lg" }), "min-h-11 rounded-sm px-5")}
                >
                  Start a {page.name.toLowerCase()} book
                  <ArrowRight aria-hidden="true" className="size-4" />
                </a>
              </p>
            </div>
          </div>
        </header>

        <div className="mx-auto grid w-full max-w-7xl gap-12 px-6 py-20 lg:grid-cols-12 lg:px-8 lg:py-28">
          <details className="border-y border-black/10 lg:hidden dark:border-white/10">
            <summary className="flex min-h-11 cursor-pointer items-center justify-between py-3 font-mono text-[0.68rem] tracking-[0.09em] text-muted-foreground uppercase marker:content-none">
              On this page
              <span aria-hidden="true" className="text-primary">
                +
              </span>
            </summary>
            <nav aria-label="On this page">
              <ol className="border-t border-black/10 py-2 dark:border-white/10">
                {(
                  [
                    ["01", "Structural elements", "#elements-heading"],
                    ["02", "Reader expectations", "#expect-heading"],
                    ["03", "Subgenres and tropes", "#sub-heading"],
                    ["04", "Questions", "#faq-heading"],
                  ] as const
                ).map(([index, label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="grid min-h-11 grid-cols-[2rem_1fr] items-center text-sm text-muted-foreground hover:text-foreground"
                    >
                      <span className="font-mono text-[0.6875rem] text-primary">{index}</span>
                      {label}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          </details>

          <aside className="hidden lg:col-span-3 lg:block">
            <nav
              aria-label="On this page"
              className="sticky top-24 border-t border-black/10 pt-4 dark:border-white/10"
            >
              <p className="folio-label text-muted-foreground">On this page</p>
              <ol className="mt-4 space-y-1">
                {(
                  [
                    ["01", "Structural elements", "#elements-heading"],
                    ["02", "Reader expectations", "#expect-heading"],
                    ["03", "Subgenres and tropes", "#sub-heading"],
                    ["04", "Questions", "#faq-heading"],
                  ] as const
                ).map(([index, label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="grid min-h-10 grid-cols-[2rem_1fr] items-center text-xs text-muted-foreground hover:text-foreground"
                    >
                      <span className="font-mono text-[0.6875rem] text-primary">{index}</span>
                      {label}
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>

          <div className="min-w-0 lg:col-span-8">
            <section
              id="elements-heading"
              aria-labelledby="elements-title"
              className="scroll-mt-24"
            >
              <p className="folio-label text-primary">Stage input / structure</p>
              <h2
                id="elements-title"
                className="mt-4 font-display text-3xl font-semibold tracking-[-0.035em]"
              >
                What a {page.name.toLowerCase()} book needs
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                These are the structural elements the outliner plans for, and where each one
                belongs.
              </p>
              <dl className="mt-8 border-y border-black/10 dark:border-white/10">
                {page.coreElements.map((element, index) => (
                  <div
                    key={element.name}
                    className="grid gap-3 border-b border-black/10 py-6 last:border-b-0 dark:border-white/10 sm:grid-cols-[minmax(12rem,0.8fr)_1.2fr]"
                  >
                    <dt className="grid grid-cols-[3rem_1fr]">
                      <span className="font-mono text-[0.6875rem] text-primary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="font-display font-semibold tracking-[-0.015em]">
                        {element.name}
                        <span className="mt-1 block font-mono text-[0.6875rem] font-normal tracking-[0.06em] text-muted-foreground uppercase">
                          {element.whenToInclude}
                        </span>
                      </span>
                    </dt>
                    <dd className="text-sm leading-6 text-pretty text-muted-foreground">
                      {element.description}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section
              id="expect-heading"
              aria-labelledby="expect-title"
              className="mt-20 scroll-mt-24 border-t border-black/10 pt-10 dark:border-white/10"
            >
              <p className="folio-label text-primary">Reader contract / expectations</p>
              <h2
                id="expect-title"
                className="mt-4 font-display text-3xl font-semibold tracking-[-0.035em]"
              >
                What {page.name.toLowerCase()} readers expect
              </h2>
              <ul className="mt-7 divide-y divide-black/10 border-y border-black/10 dark:divide-white/10 dark:border-white/10">
                {page.readerExpectations.map((expectation, index) => (
                  <li key={expectation} className="grid grid-cols-[3rem_1fr] gap-3 py-4">
                    <span className="font-mono text-[0.6875rem] text-primary">E{index + 1}</span>
                    <span className="text-sm leading-6 text-pretty text-muted-foreground">
                      {expectation}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-7 border-l border-ion pl-5 text-sm leading-6 text-pretty text-muted-foreground">
                <strong className="font-medium text-foreground">Pacing.</strong> {page.pacingNotes}
              </p>
            </section>

            <section
              id="sub-heading"
              aria-labelledby="sub-title"
              className="mt-20 scroll-mt-24 border-t border-black/10 pt-10 dark:border-white/10"
            >
              <p className="folio-label text-primary">Profile controls / subgenres</p>
              <h2
                id="sub-title"
                className="mt-4 font-display text-3xl font-semibold tracking-[-0.035em]"
              >
                Subgenres and tropes
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Pick a subgenre in the wizard and the structural guidance adapts to it.
              </p>
              <ul className="mt-7 grid gap-px bg-black/10 dark:bg-white/10 sm:grid-cols-2">
                {page.subgenres.map((subgenre, index) => (
                  <li
                    key={subgenre}
                    className="grid min-h-12 grid-cols-[2rem_1fr] items-center bg-[#f5f6f9] px-3 text-sm text-muted-foreground dark:bg-[#09090d]"
                  >
                    <span className="font-mono text-[0.6875rem] text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {subgenre}
                  </li>
                ))}
              </ul>
              <p className="mt-7 text-sm leading-6 text-pretty text-muted-foreground">
                Familiar territory the genre draws on: {page.commonTropes.join(", ")}. Ask for them
                or ask for something else — the brief decides.
              </p>
            </section>

            <section
              id="faq-heading"
              aria-labelledby="faq-title"
              className="mt-20 scroll-mt-24 border-t border-black/10 pt-10 dark:border-white/10"
            >
              <p className="folio-label text-primary">Reference / direct answers</p>
              <h2
                id="faq-title"
                className="mt-4 font-display text-3xl font-semibold tracking-[-0.035em]"
              >
                Questions about {page.name.toLowerCase()}
              </h2>
              <dl className="mt-7 border-t border-black/10 dark:border-white/10">
                {page.faqs.map((faq) => (
                  <div
                    key={faq.question}
                    className="grid gap-2 border-b border-black/10 py-6 dark:border-white/10 sm:grid-cols-[0.8fr_1.2fr] sm:gap-8"
                  >
                    <dt className="font-display font-semibold tracking-[-0.015em]">
                      {faq.question}
                    </dt>
                    <dd className="text-sm leading-6 text-pretty text-muted-foreground">
                      {faq.answer}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <nav
              aria-labelledby="other-heading"
              className="mt-20 border-t border-black/10 pt-8 dark:border-white/10"
            >
              <h2 id="other-heading" className="folio-label text-muted-foreground">
                Other genres
              </h2>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {others.map((other) => (
                  <li key={other.id}>
                    <Link
                      href={`/genres/${other.slug}`}
                      className="inline-flex min-h-11 items-center text-primary hover:underline sm:min-h-8"
                    >
                      {other.name}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/guides"
                    className="inline-flex min-h-11 items-center text-primary hover:underline sm:min-h-8"
                  >
                    Guides
                  </Link>
                </li>
                <li>
                  <Link
                    href="/pricing"
                    className="inline-flex min-h-11 items-center text-primary hover:underline sm:min-h-8"
                  >
                    Pricing
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </article>
    </>
  );
}
