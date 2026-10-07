import epub, { type Chapter } from "epub-gen-memory";
import { chapterHeading, markdownToHtml, type AssembledManuscript } from "./assemble";
import { closingBookMatter, openingBookMatter } from "@/lib/book-package";
import { isOwnedBlobUrl, ownedImageUrlFilter } from "@/lib/security/blob-url";
import type { FigureMap } from "./figures";
import { FORMAT_META, filenameStem, type ExportResult } from "./types";

const CSS = `
body { font-family: Georgia, "Literata", serif; line-height: 1.6; }
h1, h2, h3 { font-weight: 600; line-height: 1.25; }
p { margin: 0 0 0.9em; text-align: justify; }
blockquote { margin: 1.2em 1.25em; font-style: italic; }
hr { border: none; text-align: center; margin: 2em 0; }
.title-page { text-align: center; margin-top: 30%; }
.title-page .subtitle { font-size: 1.2em; }
.title-page .synopsis { font-style: italic; }
.title-page .byline { font-size: 0.85em; margin-top: 2em; }
.dedication, .epigraph { margin: 30% auto 0; max-width: 32em; text-align: center; }
.epigraph { text-align: left; }
.epigraph .attribution { text-align: right; }
.rights { margin-top: 25%; font-size: 0.85em; }
`;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titlePageHtml(m: AssembledManuscript): string {
  return [
    `<div class="title-page">`,
    `<h1>${escapeHtml(m.title)}</h1>`,
    m.matter.subtitle ? `<p class="subtitle">${escapeHtml(m.matter.subtitle)}</p>` : "",
    m.synopsis ? `<p class="synopsis">${escapeHtml(m.synopsis)}</p>` : "",
    `<p class="byline">${escapeHtml(m.matter.editionName ?? m.editionNote)}<br/>${escapeHtml(m.author)}</p>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * epub-gen-memory downloads every `<img src>` (and the cover) on the server and
 * packs the bytes into the file it hands back, following redirects to any
 * host. Left unfiltered, `![x](http://169.254.169.254/…)` in a chapter would be
 * a server-side request forgery whose response the author can then read out of
 * their own download. Only the project's own Blob images may reach it.
 */
function ownedFigures(figures: FigureMap): FigureMap {
  return Object.fromEntries(
    Object.entries(figures).map(([key, figure]) => [
      key,
      {
        ...figure,
        svgUrl: isOwnedBlobUrl(figure.svgUrl) ? figure.svgUrl : null,
        pngUrl: isOwnedBlobUrl(figure.pngUrl) ? figure.pngUrl : null,
      },
    ]),
  );
}

export async function exportEpub(m: AssembledManuscript): Promise<ExportResult> {
  const imageUrl = ownedImageUrlFilter(m.assetUrls);
  const figures = ownedFigures(m.figures);
  const html = (markdown: string) => markdownToHtml(markdown, figures, "png", { imageUrl });
  const cover = m.coverUrl ? (imageUrl(m.coverUrl) ?? undefined) : undefined;

  const rights: string[] = [];
  if (m.matter.copyrightHolder) {
    rights.push(
      m.matter.copyrightYear
        ? `© ${m.matter.copyrightYear} ${m.matter.copyrightHolder}. All rights reserved.`
        : `Copyright © ${m.matter.copyrightHolder}. All rights reserved.`,
    );
  }
  if (m.matter.publisher) rights.push(`Published by ${m.matter.publisher}.`);
  if (m.matter.isbn) rights.push(`ISBN ${m.matter.isbn}`);

  const content: Chapter[] = [
    {
      title: m.title,
      content: titlePageHtml(m),
      excludeFromToc: true,
      beforeToc: true,
    },
    ...(rights.length > 0
      ? [
          {
            title: "Copyright",
            content: `<div class="rights"><h2>Copyright</h2>${rights
              .map((line) => `<p>${escapeHtml(line)}</p>`)
              .join("")}</div>`,
            excludeFromToc: true,
            beforeToc: true,
          } satisfies Chapter,
        ]
      : []),
    ...(m.matter.dedication
      ? [
          {
            title: "Dedication",
            content: `<div class="dedication"><p><em>${escapeHtml(m.matter.dedication)}</em></p></div>`,
            excludeFromToc: true,
            beforeToc: true,
          } satisfies Chapter,
        ]
      : []),
    ...(m.matter.epigraphText
      ? [
          {
            title: "Epigraph",
            content: `<div class="epigraph"><blockquote>${escapeHtml(
              m.matter.epigraphText,
            )}</blockquote>${
              m.matter.epigraphAttribution
                ? `<p class="attribution">— ${escapeHtml(m.matter.epigraphAttribution)}</p>`
                : ""
            }</div>`,
            excludeFromToc: true,
            beforeToc: true,
          } satisfies Chapter,
        ]
      : []),
    ...openingBookMatter(m.matter).map((section) => ({
      title: section.title,
      content: `<h2>${escapeHtml(section.title)}</h2>\n${html(section.markdown)}`,
      beforeToc: true,
    })),
    ...m.chapters.map((chapter) => ({
      title: chapterHeading(chapter),
      // PNG rather than SVG: epub-gen-memory downloads referenced images, and
      // reader support for inline SVG is far less dependable than for raster.
      content: `<h2>${escapeHtml(chapterHeading(chapter))}</h2>\n${html(chapter.markdown)}`,
    })),
    ...closingBookMatter(m.matter).map((section) => ({
      title: section.title,
      content: `<h2>${escapeHtml(section.title)}</h2>\n${html(section.markdown)}`,
    })),
  ];

  const buffer = await epub(
    {
      title: m.title,
      author: m.author,
      cover,
      description: m.synopsis ?? undefined,
      tocTitle: "Contents",
      prependChapterTitles: false,
      css: CSS,
      verbose: false,
      // Defaults are a 20s timeout and three retries per image; owned Blob
      // objects either answer quickly or are gone.
      fetchTimeout: 10_000,
      retryTimes: 1,
    },
    content,
  );

  const meta = FORMAT_META.epub;
  return {
    buffer,
    contentType: meta.contentType,
    filename: `${filenameStem(m.title)}.${meta.extension}`,
  };
}
