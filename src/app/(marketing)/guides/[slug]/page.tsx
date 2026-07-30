import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  BreadcrumbJsonLd,
  FaqJsonLd,
  SITE_URL,
  SOCIAL_IMAGE,
  SOCIAL_IMAGE_ALT,
} from "@/components/seo/json-ld";
import { GUIDES, getGuide, type GuideBlock } from "@/lib/marketing/guides";

export function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guides/${guide.slug}` },
    openGraph: {
      title: `${guide.title} · sopher.ai`,
      description: guide.description,
      url: `${SITE_URL}/guides/${guide.slug}`,
      type: "article",
      images: [
        {
          url: SOCIAL_IMAGE,
          width: 1200,
          height: 630,
          alt: SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: `${guide.title} · sopher.ai`,
      description: guide.description,
      images: [{ url: SOCIAL_IMAGE, alt: SOCIAL_IMAGE_ALT }],
    },
  };
}

/** Blocks stay semantic and server-rendered so the guide remains search-readable. */
function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "h2":
      return (
        <h2
          id={block.id}
          className="mt-16 scroll-mt-24 border-t border-black/10 pt-10 font-display text-3xl font-semibold tracking-[-0.035em] dark:border-white/10"
        >
          {block.text}
        </h2>
      );
    case "p":
      return (
        <p className="mt-5 max-w-[70ch] leading-7 text-pretty text-muted-foreground">
          {block.text}
        </p>
      );
    case "list":
      return (
        <ul className="mt-6 divide-y divide-black/10 border-y border-black/10 dark:divide-white/10 dark:border-white/10">
          {block.items.map((item, index) => (
            <li key={item} className="grid grid-cols-[3rem_1fr] gap-3 py-4">
              <span className="font-mono text-[0.6875rem] text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-sm leading-6 text-pretty text-muted-foreground">{item}</span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="mt-7 border-y border-black/10 dark:border-white/10">
          {block.items.map((item, index) => (
            <li
              key={item.name}
              className="grid gap-3 border-b border-black/10 py-5 last:border-b-0 dark:border-white/10 sm:grid-cols-[3rem_11rem_1fr]"
            >
              <span className="font-mono text-[0.6875rem] tabular-nums text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <strong className="font-display font-semibold tracking-[-0.015em]">
                {item.name}
              </strong>
              <span className="text-sm leading-6 text-pretty text-muted-foreground">
                {item.text}
              </span>
            </li>
          ))}
        </ol>
      );
    case "note":
      return (
        <p className="mt-8 border-l border-ion bg-black/[0.02] px-5 py-4 text-sm leading-6 text-pretty dark:bg-white/[0.025]">
          {block.text}
        </p>
      );
  }
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const others = GUIDES.filter((other) => other.slug !== guide.slug);

  return (
    <>
      {guide.faqs ? <FaqJsonLd items={guide.faqs} /> : null}
      <BreadcrumbJsonLd
        trail={[
          { name: "Guides", path: "/guides" },
          { name: guide.title, path: `/guides/${guide.slug}` },
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
                      href="/guides"
                      className="inline-flex min-h-11 items-center hover:underline"
                    >
                      Guides
                    </Link>
                  </li>
                  <li aria-hidden="true">/</li>
                  <li aria-current="page" className="text-muted-foreground">
                    Field note
                  </li>
                </ol>
              </nav>
            </div>
            <div className="lg:col-span-8">
              <h1 className="max-w-4xl font-display text-5xl font-semibold leading-[0.98] tracking-[-0.04em] text-balance sm:text-6xl">
                {guide.title}
              </h1>
              <p className="mt-6 max-w-3xl text-lg leading-8 text-pretty text-muted-foreground">
                {guide.standfirst}
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
                {guide.blocks.map((block, index) =>
                  block.kind === "h2" ? (
                    <li key={block.id}>
                      <Link
                        href={`#${block.id}`}
                        className="grid min-h-11 grid-cols-[2rem_1fr] items-center text-sm text-muted-foreground hover:text-foreground"
                      >
                        <span className="font-mono text-[0.6875rem] text-primary">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {block.text}
                      </Link>
                    </li>
                  ) : null,
                )}
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
                {guide.blocks.map((block, index) =>
                  block.kind === "h2" ? (
                    <li key={block.id}>
                      <Link
                        href={`#${block.id}`}
                        className="grid min-h-10 grid-cols-[2rem_1fr] items-center text-xs text-muted-foreground hover:text-foreground"
                      >
                        <span className="font-mono text-[0.6875rem] text-primary">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {block.text}
                      </Link>
                    </li>
                  ) : null,
                )}
              </ol>
            </nav>
          </aside>

          <div className="min-w-0 lg:col-span-8">
            <p className="folio-label text-primary">Manual / verified product behavior</p>
            <div className="mt-8">
              {guide.blocks.map((block, index) => (
                <Block key={`${block.kind}-${index}`} block={block} />
              ))}
            </div>

            {guide.faqs ? (
              <section
                aria-labelledby="guide-faq"
                className="mt-20 border-t border-black/10 pt-10 dark:border-white/10"
              >
                <p className="folio-label text-primary">Reference / direct answers</p>
                <h2
                  id="guide-faq"
                  className="mt-4 font-display text-3xl font-semibold tracking-[-0.035em]"
                >
                  Questions
                </h2>
                <dl className="mt-7 border-t border-black/10 dark:border-white/10">
                  {guide.faqs.map((faq) => (
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
            ) : null}

            <nav
              aria-label="Other guides"
              className="mt-20 border-t border-black/10 pt-8 text-sm dark:border-white/10"
            >
              <p className="folio-label text-muted-foreground">Keep reading</p>
              <ul className="mt-4 space-y-1">
                {others.map((other) => (
                  <li key={other.slug}>
                    <Link
                      href={`/guides/${other.slug}`}
                      className="inline-flex min-h-11 items-center text-primary hover:underline sm:min-h-9"
                    >
                      {other.title}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link
                    href="/genres"
                    className="inline-flex min-h-11 items-center text-primary hover:underline sm:min-h-9"
                  >
                    Writing in a specific genre
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
