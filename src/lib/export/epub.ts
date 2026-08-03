import epub, { type Chapter } from "epub-gen-memory";
import { chapterHeading, markdownToHtml, type AssembledManuscript } from "./assemble";
import { closingBookMatter, openingBookMatter } from "@/lib/book-package";
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

export async function exportEpub(m: AssembledManuscript): Promise<ExportResult> {
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
      content: `<h2>${escapeHtml(section.title)}</h2>\n${markdownToHtml(section.markdown, m.figures, "png")}`,
      beforeToc: true,
    })),
    ...m.chapters.map((chapter) => ({
      title: chapterHeading(chapter),
      // PNG rather than SVG: epub-gen-memory downloads referenced images, and
      // reader support for inline SVG is far less dependable than for raster.
      content: `<h2>${escapeHtml(chapterHeading(chapter))}</h2>\n${markdownToHtml(chapter.markdown, m.figures, "png")}`,
    })),
    ...closingBookMatter(m.matter).map((section) => ({
      title: section.title,
      content: `<h2>${escapeHtml(section.title)}</h2>\n${markdownToHtml(section.markdown, m.figures, "png")}`,
    })),
  ];

  const buffer = await epub(
    {
      title: m.title,
      author: m.author,
      cover: m.coverUrl ?? undefined,
      description: m.synopsis ?? undefined,
      tocTitle: "Contents",
      prependChapterTitles: false,
      css: CSS,
      verbose: false,
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
