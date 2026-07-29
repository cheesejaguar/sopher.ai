import { Marked } from "marked";
import { and, eq, gt, sql } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { diagramSourceHash, loadFigures, type FigureAsset, type FigureMap } from "./figures";

/**
 * Manuscript assembly: turns a project's book + ordered chapters into a
 * format-neutral structure, plus the deterministic markdown/HTML builders the
 * per-format exporters share. Everything except `loadManuscript` is pure.
 */

export const MANUSCRIPT_AUTHOR = "Written with sopher.ai";
export const READING_LINE = "an early reading copy";

export type ManuscriptChapter = {
  number: number;
  title: string;
  markdown: string;
  wordCount: number;
};

export type AssembledManuscript = {
  title: string;
  author: string;
  synopsis: string | null;
  genre: string | null;
  chapters: ManuscriptChapter[];
  totalWords: number;
  /** Cached diagram/image renders, keyed by source hash or image URL. */
  figures: FigureMap;
};

export type ManuscriptSourceChapter = {
  number: number;
  title: string | null;
  content: string;
};

/** Filters empty chapters, orders by number, and fills default titles. Pure. */
export function buildManuscript(input: {
  title: string;
  synopsis?: string | null;
  genre?: string | null;
  /** Author byline; falls back to the house line when unset. */
  author?: string | null;
  chapters: ManuscriptSourceChapter[];
  figures?: FigureMap;
}): AssembledManuscript {
  const chapters = input.chapters
    .filter((c) => c.content.trim().length > 0)
    .sort((a, b) => a.number - b.number)
    .map((c) => {
      const markdown = c.content.trim();
      return {
        number: c.number,
        title: c.title?.trim() || `Chapter ${c.number}`,
        markdown,
        wordCount: markdown.split(/\s+/).filter(Boolean).length,
      };
    });
  return {
    title: input.title.trim(),
    author: input.author?.trim() || MANUSCRIPT_AUTHOR,
    synopsis: input.synopsis?.trim() || null,
    genre: input.genre?.trim() || null,
    chapters,
    totalWords: chapters.reduce((sum, c) => sum + c.wordCount, 0),
    figures: input.figures ?? {},
  };
}

/** "Chapter 3 — The Storm" (or just "Chapter 3" when the title is the default). */
export function chapterHeading(chapter: Pick<ManuscriptChapter, "number" | "title">): string {
  const plain = `Chapter ${chapter.number}`;
  return chapter.title === plain ? plain : `${plain} — ${chapter.title}`;
}

/** The complete assembled .md file: title page, contents, chapters. Deterministic. */
export function manuscriptToMarkdown(m: AssembledManuscript): string {
  const lines: string[] = [`# ${m.title}`, ""];
  if (m.synopsis) lines.push(`*${m.synopsis}*`, "");
  lines.push(m.author, "", "## Contents", "");
  for (const chapter of m.chapters) {
    lines.push(`${chapter.number}. ${chapter.title}`);
  }
  lines.push("");
  for (const chapter of m.chapters) {
    lines.push("***", "", `## ${chapterHeading(chapter)}`, "", chapter.markdown, "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function figureHtml(figure: FigureAsset, prefer: "svg" | "png"): string {
  const src =
    prefer === "svg" ? (figure.svgUrl ?? figure.pngUrl) : (figure.pngUrl ?? figure.svgUrl);
  if (!src) return "";
  return [
    `<figure class="manuscript-figure">`,
    `<img src="${escapeHtml(src)}" alt="${escapeHtml(figure.alt)}" />`,
    `</figure>`,
  ].join("");
}

/**
 * A Marked instance is built per call so the mermaid renderer can close over
 * this render's figure map. Instances are cheap; correctness beats reuse here.
 */
function createRenderer(figures: FigureMap, prefer: "svg" | "png"): Marked {
  const renderer = new Marked({ async: false, gfm: true, breaks: false });
  renderer.use({
    renderer: {
      // Chapter prose is AI/user markdown; escape raw HTML rather than pass it through.
      html(token) {
        return escapeHtml(token.text);
      },
      code(token) {
        if (token.lang !== "mermaid") return false as unknown as string;
        const figure = figures[diagramSourceHash(token.text)];
        // Uncached diagram: fall through to the default fenced-code rendering
        // so the source is still visible rather than lost.
        if (!figure) return false as unknown as string;
        return figureHtml(figure, prefer);
      },
    },
  });
  return renderer;
}

const defaultRenderer = createRenderer({}, "svg");

/**
 * Markdown → HTML with raw HTML escaped. Used by the reading view and the
 * HTML-based exporters. `prefer` picks the image variant: the web view wants
 * crisp SVG, EPUB readers are far more reliable with PNG.
 */
export function markdownToHtml(
  markdown: string,
  figures?: FigureMap,
  prefer: "svg" | "png" = "svg",
): string {
  const renderer =
    figures && Object.keys(figures).length > 0 ? createRenderer(figures, prefer) : defaultRenderer;
  return renderer.parse(markdown) as string;
}

// ---------------------------------------------------------------------------
// Block-level parse for the non-HTML exporters (docx, pdf).
// ---------------------------------------------------------------------------

export type ProseBlock =
  | { kind: "heading"; depth: 1 | 2 | 3; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "scene-break" }
  | { kind: "figure"; figure: FigureAsset }
  /** A diagram with no cached render — exporters print the source instead. */
  | { kind: "code"; language: string; text: string };

const MERMAID_FENCE_RE = /^```mermaid[ \t]*\n([\s\S]*?)\n?```$/;
const IMAGE_ONLY_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

/**
 * Minimal, deterministic markdown block parser for prose. Handles headings,
 * quotes, scene breaks, paragraphs, plus standalone figures (mermaid fences and
 * image-only lines) so the non-HTML exporters can embed them.
 */
export function markdownToBlocks(markdown: string, figures: FigureMap = {}): ProseBlock[] {
  const blocks: ProseBlock[] = [];
  for (const raw of markdown.split(/\n[ \t]*\n+/)) {
    const block = raw.trim();
    if (!block) continue;

    const mermaid = block.match(MERMAID_FENCE_RE);
    if (mermaid) {
      const source = mermaid[1];
      const figure = figures[diagramSourceHash(source)];
      // No cached render (diagram never opened in the editor) — keep the source
      // rather than dropping the content entirely.
      blocks.push(
        figure ? { kind: "figure", figure } : { kind: "code", language: "mermaid", text: source },
      );
      continue;
    }

    const image = block.match(IMAGE_ONLY_RE);
    if (image) {
      const [, alt, url] = image;
      const known = figures[url];
      blocks.push({
        kind: "figure",
        figure: known ?? { svgUrl: null, pngUrl: url, alt: alt || "Illustration" },
      });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(block)) {
      blocks.push({ kind: "scene-break" });
      continue;
    }
    const heading = block.match(/^(#{1,6})\s+([\s\S]*)$/);
    if (heading) {
      const depth = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: "heading", depth, text: heading[2].replace(/\s*\n\s*/g, " ").trim() });
      continue;
    }
    if (/^>/.test(block)) {
      const text = block
        .split("\n")
        .map((line) => line.replace(/^>\s?/, "").trim())
        .filter(Boolean)
        .join(" ");
      blocks.push({ kind: "quote", text });
      continue;
    }
    blocks.push({ kind: "paragraph", text: block.replace(/\s*\n\s*/g, " ").trim() });
  }
  return blocks;
}

export type InlineSegment = { text: string; bold?: boolean; italic?: boolean };

/** Splits **strong** / *em* / _em_ runs out of a text line. Deterministic. */
export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|_[^_\n]+_)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index) });
    const token = match[0];
    if (token.startsWith("**")) segments.push({ text: token.slice(2, -2), bold: true });
    else segments.push({ text: token.slice(1, -1), italic: true });
    last = index + token.length;
  }
  if (last < text.length) segments.push({ text: text.slice(last) });
  return segments.filter((s) => s.text.length > 0);
}

/** Strips inline markers entirely (for plain-text sinks like PDF body copy). */
export function stripInline(text: string): string {
  return parseInline(text)
    .map((s) => s.text)
    .join("");
}

// ---------------------------------------------------------------------------
// DB loading (the one impure function here).
// ---------------------------------------------------------------------------

/** Loads the user's book with full chapter contents; null when unowned or bookless. */
export async function loadManuscript(
  userId: string,
  projectId: string,
): Promise<AssembledManuscript | null> {
  const db = getDb();
  const [row] = await db
    .select({
      projectId: schema.projects.id,
      genre: schema.projects.genre,
      bookId: schema.books.id,
      bookTitle: schema.books.title,
      synopsis: schema.books.synopsis,
      frontMatter: schema.books.frontMatter,
    })
    .from(schema.projects)
    .innerJoin(schema.books, eq(schema.books.projectId, schema.projects.id))
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!row) return null;

  const chapters = await db
    .select({
      number: schema.chapters.chapterNumber,
      title: schema.chapters.title,
      content: schema.chapters.content,
    })
    .from(schema.chapters)
    .where(
      and(eq(schema.chapters.bookId, row.bookId), gt(sql`length(${schema.chapters.content})`, 0)),
    )
    .orderBy(schema.chapters.chapterNumber);

  const author = (row.frontMatter as { author?: string } | null)?.author;
  return buildManuscript({
    title: row.bookTitle,
    synopsis: row.synopsis,
    genre: row.genre,
    author,
    chapters,
    figures: await loadFigures(row.projectId),
  });
}
