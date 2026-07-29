import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BreadcrumbJsonLd, FaqJsonLd, SITE_URL } from "@/components/seo/json-ld";
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
    },
  };
}

/** Blocks render to real semantic markup — every list is a list a crawler parses. */
function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case "h2":
      return (
        <h2
          id={block.id}
          className="mt-12 font-display text-2xl font-semibold tracking-tight scroll-mt-24"
        >
          {block.text}
        </h2>
      );
    case "p":
      return <p className="mt-4 text-pretty text-muted-foreground">{block.text}</p>;
    case "list":
      return (
        <ul className="mt-4 space-y-2">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3 text-muted-foreground">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-ai" />
              <span className="text-pretty">{item}</span>
            </li>
          ))}
        </ul>
      );
    case "steps":
      return (
        <ol className="mt-5 space-y-4">
          {block.items.map((item, index) => (
            <li key={item.name} className="flex gap-4">
              <span
                aria-hidden="true"
                className="mt-0.5 font-mono text-xs tabular-nums text-primary"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>
                <strong className="font-medium">{item.name}</strong>
                <span className="mt-0.5 block text-sm text-pretty text-muted-foreground">
                  {item.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
      );
    case "note":
      return (
        <p className="mt-6 rounded-lg border border-ai/40 bg-ai-soft px-4 py-3 text-sm text-pretty">
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

      <article className="mx-auto w-full max-w-2xl px-6 py-20 sm:py-28">
        <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">
          <Link href="/guides" className="hover:underline">
            Guides
          </Link>
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-balance">
          {guide.title}
        </h1>
        <p className="mt-4 text-lg text-pretty text-muted-foreground">{guide.standfirst}</p>

        <div className="mt-8">
          {guide.blocks.map((block, index) => (
            <Block key={`${block.kind}-${index}`} block={block} />
          ))}
        </div>

        {guide.faqs ? (
          <section aria-labelledby="guide-faq" className="mt-14">
            <h2 id="guide-faq" className="font-display text-2xl font-semibold tracking-tight">
              Questions
            </h2>
            <dl className="mt-6 space-y-6">
              {guide.faqs.map((faq) => (
                <div key={faq.question}>
                  <dt className="font-medium">{faq.question}</dt>
                  <dd className="mt-1.5 text-sm text-pretty text-muted-foreground">{faq.answer}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        <nav aria-label="Other guides" className="mt-16 border-t border-border pt-8 text-sm">
          <p className="font-sans font-semibold">Keep reading</p>
          <ul className="mt-3 space-y-1.5">
            {others.map((other) => (
              <li key={other.slug}>
                <Link href={`/guides/${other.slug}`} className="text-primary hover:underline">
                  {other.title}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/genres" className="text-primary hover:underline">
                Writing in a specific genre
              </Link>
            </li>
          </ul>
        </nav>
      </article>
    </>
  );
}
