import Image from "next/image";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";

import { ReaderChrome } from "@/components/reader/reader-chrome";
import { ReaderSessionBootstrap } from "@/components/reader/reader-session-bootstrap";
import { closingBookMatter, openingBookMatter } from "@/lib/book-package";
import { markdownToHtml } from "@/lib/export/assemble";
import {
  isOwnedReaderAssetUrl,
  loadReaderEdition,
  publicationAssetUrls,
  publicationMatter,
  readerAssetKey,
  readerFigureMap,
  readerShareIdSchema,
} from "@/lib/publication-editions";
import { readerSessionCookieName } from "@/lib/reader-session";

export const metadata: Metadata = {
  title: "Reader edition",
  description: "An unlisted reader edition shared by its author.",
  robots: { index: false, follow: false, noarchive: true, nosnippet: true, noimageindex: true },
  referrer: "no-referrer",
};

export default function ReaderPage({ params }: { params: Promise<{ shareId: string }> }) {
  return (
    <Suspense
      fallback={
        <main
          id="main-content"
          tabIndex={-1}
          className="safe-area-page grid min-h-dvh place-items-center px-6 py-16"
        >
          <p role="status" className="folio-label text-primary">
            Opening reader edition…
          </p>
        </main>
      }
    >
      <ReaderEdition params={params} />
    </Suspense>
  );
}

async function ReaderEdition({ params }: { params: Promise<{ shareId: string }> }) {
  await connection();
  const { shareId } = await params;
  const readerBasePath = `/r/${shareId}`;
  const validShareId = readerShareIdSchema.safeParse(shareId).success;
  const token = validShareId
    ? (await cookies()).get(readerSessionCookieName(shareId))?.value
    : null;
  const loadedEdition = token ? await loadReaderEdition(token) : null;
  const edition = loadedEdition?.shareId === shareId ? loadedEdition : null;

  if (!edition) {
    return (
      <>
        <ReaderSessionBootstrap shareId={shareId} />
        <main
          id="main-content"
          tabIndex={-1}
          className="safe-area-page grid min-h-dvh place-items-center px-6 py-16"
        >
          <section className="instrument-surface max-w-lg rounded-sm p-8 text-center">
            <p className="folio-label text-primary">Reader edition</p>
            <h1 className="mt-3 text-2xl font-semibold text-balance">Opening reader edition…</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Keep this tab open while the complete link is checked. No manuscript content is loaded
              until the private fragment is verified.
            </p>
          </section>
        </main>
      </>
    );
  }

  const { snapshot } = edition;
  const matter = publicationMatter(snapshot);
  const opening = openingBookMatter(matter);
  const closing = closingBookMatter(matter);
  const figures = readerFigureMap(snapshot, readerBasePath);
  const assetUrls = publicationAssetUrls(snapshot);
  const readerImageUrl = (href: string): string | null => {
    if (!isOwnedReaderAssetUrl(href)) return null;
    const key = readerAssetKey(href);
    return assetUrls.has(key) ? `${readerBasePath}/assets/${key}` : null;
  };
  const captured = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(snapshot.capturedAt));

  return (
    <>
      <ReaderSessionBootstrap shareId={shareId} hasValidSession />
      <ReaderChrome
        title={snapshot.title}
        readerBasePath={readerBasePath}
        allowDownload={edition.allowDownload}
        chapters={snapshot.chapters.map(({ number, title }) => ({ number, title }))}
      >
        <main id="main-content" tabIndex={-1} className="reader-main safe-area-page py-8 sm:py-14">
          <article className="reader-page mx-auto max-w-[48rem] border px-5 py-12 shadow-2xl sm:px-14 sm:py-20">
            {snapshot.incomplete ? (
              <p className="reader-notice mx-auto mb-12 max-w-xl border-y py-3 text-center text-sm">
                This is an in-progress edition captured on {captured}. Later author changes are not
                reflected here.
              </p>
            ) : null}

            <header id="title-page" className="scroll-mt-36 py-10 text-center sm:py-20">
              {snapshot.coverUrl ? (
                <Image
                  src={`${readerBasePath}/assets/${readerAssetKey(snapshot.coverUrl)}`}
                  alt={`Cover of ${snapshot.title}`}
                  width={360}
                  height={540}
                  sizes="(max-width: 640px) 70vw, 360px"
                  referrerPolicy="no-referrer"
                  unoptimized
                  className="mx-auto mb-12 h-auto w-full max-w-[20rem] border shadow-2xl"
                />
              ) : null}
              {snapshot.genre ? (
                <p className="reader-kicker text-xs tracking-[0.24em] uppercase">
                  {snapshot.genre}
                </p>
              ) : null}
              <h1 className="mt-5 font-display text-4xl font-semibold text-balance sm:text-6xl">
                {snapshot.title}
              </h1>
              {matter.subtitle ? (
                <p className="mx-auto mt-5 max-w-2xl font-serif text-xl leading-relaxed sm:text-2xl">
                  {matter.subtitle}
                </p>
              ) : null}
              <p className="mt-10 font-serif text-lg">{snapshot.author}</p>
              <p className="reader-kicker mt-3 font-serif text-sm italic">
                {matter.editionName ?? snapshot.editionNote}
              </p>
              <p aria-hidden="true" className="reader-kicker mt-14 text-xl">
                ⁂
              </p>
            </header>

            {matter.copyrightHolder || matter.publisher || matter.isbn ? (
              <section className="reader-matter mx-auto max-w-2xl border-t py-14 text-sm leading-relaxed">
                <h2 className="sr-only">Copyright and edition details</h2>
                {matter.copyrightHolder ? (
                  <p>
                    {matter.copyrightYear ? `© ${matter.copyrightYear} ` : "Copyright © "}
                    {matter.copyrightHolder}. All rights reserved.
                  </p>
                ) : null}
                {matter.publisher ? <p>Published by {matter.publisher}.</p> : null}
                {matter.isbn ? <p>ISBN {matter.isbn}</p> : null}
              </section>
            ) : null}

            {matter.dedication ? (
              <section className="reader-matter mx-auto max-w-xl border-t py-20 text-center">
                <h2 className="sr-only">Dedication</h2>
                <p className="font-serif text-lg italic">{matter.dedication}</p>
              </section>
            ) : null}

            {matter.epigraphText ? (
              <section className="reader-matter mx-auto max-w-xl border-t py-20">
                <h2 className="sr-only">Epigraph</h2>
                <blockquote className="font-serif text-lg leading-relaxed">
                  <p>{matter.epigraphText}</p>
                  {matter.epigraphAttribution ? (
                    <footer className="reader-kicker mt-4 text-right text-sm">
                      — {matter.epigraphAttribution}
                    </footer>
                  ) : null}
                </blockquote>
              </section>
            ) : null}

            {opening.map((section) => (
              <section
                key={section.key}
                className="reader-prose reader-matter mx-auto border-t py-14"
              >
                <h2>{section.title}</h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: markdownToHtml(section.markdown, figures, "svg", {
                      imageUrl: readerImageUrl,
                    }),
                  }}
                />
              </section>
            ))}

            <section className="reader-contents-page reader-matter mx-auto border-t py-14">
              <h2>Contents</h2>
              <ol>
                {snapshot.chapters.map((chapter) => (
                  <li key={chapter.number}>
                    <a href={`#chapter-${chapter.number}`}>
                      <span>Chapter {chapter.number}</span>
                      <span>{chapter.title}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>

            {snapshot.chapters.map((chapter) => (
              <section
                id={`chapter-${chapter.number}`}
                key={chapter.number}
                className="reader-prose reader-chapter mx-auto scroll-mt-36 border-t py-14 sm:py-20"
              >
                <p className="reader-kicker text-center text-xs tracking-[0.2em] uppercase">
                  Chapter {chapter.number}
                </p>
                <h2>{chapter.title}</h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: markdownToHtml(chapter.markdown, figures, "svg", {
                      imageUrl: readerImageUrl,
                    }),
                  }}
                />
              </section>
            ))}

            {closing.map((section) => (
              <section
                key={section.key}
                className="reader-prose reader-matter mx-auto border-t py-14"
              >
                <h2>{section.title}</h2>
                <div
                  dangerouslySetInnerHTML={{
                    __html: markdownToHtml(section.markdown, figures, "svg", {
                      imageUrl: readerImageUrl,
                    }),
                  }}
                />
              </section>
            ))}
          </article>
        </main>
      </ReaderChrome>
    </>
  );
}
