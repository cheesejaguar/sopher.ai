import epub, { type Chapter } from "epub-gen-memory";
import {
  chapterHeading,
  markdownToHtml,
  READING_LINE,
  type AssembledManuscript,
} from "./assemble";
import { FORMAT_META, filenameStem, type ExportResult } from "./types";

const CSS = `
body { font-family: Georgia, "Literata", serif; line-height: 1.6; }
h1, h2, h3 { font-weight: 600; line-height: 1.25; }
p { margin: 0 0 0.9em; text-align: justify; }
blockquote { margin: 1.2em 1.25em; font-style: italic; }
hr { border: none; text-align: center; margin: 2em 0; }
.title-page { text-align: center; margin-top: 30%; }
.title-page .synopsis { font-style: italic; }
.title-page .byline { font-size: 0.85em; margin-top: 2em; }
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
    m.synopsis ? `<p class="synopsis">${escapeHtml(m.synopsis)}</p>` : "",
    `<p class="byline">${escapeHtml(READING_LINE)}<br/>${escapeHtml(m.author)}</p>`,
    `</div>`,
  ]
    .filter(Boolean)
    .join("\n");
}

export async function exportEpub(m: AssembledManuscript): Promise<ExportResult> {
  const content: Chapter[] = [
    {
      title: m.title,
      content: titlePageHtml(m),
      excludeFromToc: true,
      beforeToc: true,
    },
    ...m.chapters.map((chapter) => ({
      title: chapterHeading(chapter),
      content: `<h2>${escapeHtml(chapterHeading(chapter))}</h2>\n${markdownToHtml(chapter.markdown)}`,
    })),
  ];

  const buffer = await epub(
    {
      title: m.title,
      author: m.author,
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
