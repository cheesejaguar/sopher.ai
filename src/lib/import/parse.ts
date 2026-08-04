import DOMPurify from "isomorphic-dompurify";

import { isSafeHref } from "@/lib/security/url";

/**
 * Import parsing: every accepted upload becomes Markdown here so the chapter
 * detector in `split.ts` has exactly one input shape to reason about.
 *
 * The .docx path arrives as HTML (mammoth is the only reader in the tree that
 * understands Word's zip container — the `docx` package writes and cannot
 * read). Everything else is text. Both funnel through
 * `normalizeImportedMarkdown`, because Word's invisible characters and a
 * .txt file's leading indentation are the two things most likely to turn an
 * author's prose into something Markdown reads as a code block.
 *
 * Pure: no I/O, no database, no model calls. The only dependency is the
 * sanitizer, which parses the HTML for us.
 */

export const IMPORT_FORMATS = ["docx", "markdown", "text"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

/** Word emits these around field results and smart-quote runs; they are noise. */
const ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;
const LINE_SEPARATORS = /[\u2028\u2029]/g;
const NON_BREAKING_SPACE = /[\u00a0\u202f]/g;

/** Blankness that does not treat a form feed as whitespace — `split.ts` needs those. */
function isBlank(line: string): boolean {
  return /^[ \t]*$/.test(line);
}

function trimHorizontal(line: string): string {
  return line.replace(/^[ \t]+/, "").replace(/[ \t]+$/, "");
}

/**
 * Canonical form for everything downstream: LF endings, no invisibles, no
 * trailing spaces, at most one blank line between blocks. Form feeds survive —
 * they are one of the chapter-boundary signals.
 */
export function normalizeImportedMarkdown(source: string): string {
  return source
    .replace(/\r\n?/g, "\n")
    .replace(LINE_SEPARATORS, "\n")
    .replace(ZERO_WIDTH, "")
    .replace(NON_BREAKING_SPACE, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/**
 * Plain text has no Markdown semantics, so leading indentation is a typesetting
 * habit rather than content — and four columns of it would silently become a
 * code block. Paragraph breaks are recovered from blank lines when the file has
 * any, from the indent that marks each paragraph's first line when it does not,
 * and otherwise from the one-paragraph-per-line shape most editors export.
 */
export function plainTextToMarkdown(text: string): string {
  const lines = normalizeImportedMarkdown(text).split("\n");
  if (lines.some(isBlank)) return lines.map(trimHorizontal).join("\n");

  const indented = lines.filter((line) => /^[ \t]/.test(line)).length;
  if (indented >= 3 && indented < lines.length) {
    const paragraphs: string[] = [];
    for (const line of lines) {
      const content = trimHorizontal(line);
      if (!content) continue;
      if (/^[ \t]/.test(line) || paragraphs.length === 0) paragraphs.push(content);
      else paragraphs[paragraphs.length - 1] += ` ${content}`;
    }
    return paragraphs.join("\n\n");
  }
  return lines.map(trimHorizontal).filter(Boolean).join("\n\n");
}

// ---------------------------------------------------------------------------
// HTML → Markdown
// ---------------------------------------------------------------------------

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "ins",
  "sup",
  "sub",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "div",
  "span",
  "section",
  "article",
  "figure",
  "figcaption",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title"];

/** Markdown block openers that would change meaning if prose happened to start with one. */
const LINE_START_MARKER = /^(#{1,6}\s|>|\s*[-*+]\s|\s*\d+[.)]\s)/;
const THEMATIC_BREAK = /^([-*_])(?:[ \t]*\1){2,}[ \t]*$/;

function isElement(node: ChildNode): node is Element {
  return node.nodeType === ELEMENT_NODE;
}

function tagOf(element: Element): string {
  return element.tagName.toLowerCase();
}

/** Collapses HTML whitespace and neutralizes the one character Markdown consumes. */
function textOf(node: ChildNode): string {
  return (node.nodeValue ?? "").replace(/\s+/g, " ").replace(/\\/g, "\\\\");
}

/**
 * Emphasis markers only bind when they touch the word, so whitespace that ended
 * up inside `<strong> word </strong>` has to move outside the asterisks.
 */
function wrap(inner: string, marker: string): string {
  const match = inner.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match || !match[2]) return inner;
  return `${match[1]}${marker}${match[2]}${marker}${match[3]}`;
}

function inlineOf(parent: Element): string {
  let out = "";
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      out += textOf(child);
      continue;
    }
    if (!isElement(child)) continue;
    switch (tagOf(child)) {
      case "br":
        out += "\n";
        break;
      case "strong":
      case "b":
        out += wrap(inlineOf(child), "**");
        break;
      case "em":
      case "i":
        out += wrap(inlineOf(child), "*");
        break;
      case "s":
      case "strike":
      case "del":
        out += wrap(inlineOf(child), "~~");
        break;
      case "code":
        out += `\`${child.textContent?.replace(/\s+/g, " ") ?? ""}\``;
        break;
      case "a": {
        const text = inlineOf(child);
        const href = child.getAttribute("href") ?? "";
        out += href && isSafeHref(href) ? `[${text}](${href})` : text;
        break;
      }
      case "img":
        out += imageOf(child);
        break;
      default:
        out += inlineOf(child);
    }
  }
  return out;
}

/**
 * Word embeds every picture in the file itself, and mammoth hands those back as
 * base64 `data:` URIs — a megabyte of manuscript per photograph. Only fetchable
 * images survive; the rest are dropped rather than inlined into chapter text.
 */
function imageOf(element: Element): string {
  const src = element.getAttribute("src") ?? "";
  if (!src || !/^https?:/i.test(src) || !isSafeHref(src)) return "";
  const alt = (element.getAttribute("alt") ?? "").replace(/[[\]]/g, "");
  return `![${alt}](${src})`;
}

/** Escapes only what would change a line's block type — never mid-sentence prose. */
function paragraph(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      // HTML collapses runs of whitespace, and so did the text nodes; the pairs
      // that survive are the ones emphasis moved out of its markers.
      const trimmed = trimHorizontal(line).replace(/[ \t]{2,}/g, " ");
      return THEMATIC_BREAK.test(trimmed) || LINE_START_MARKER.test(trimmed)
        ? `\\${trimmed}`
        : trimmed;
    })
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "");
}

/**
 * A table cell, with every pipe escaped so it cannot split the row.
 *
 * Escaping the pipe alone is not enough, because the string arriving here has
 * mixed backslash conventions: `textOf` doubles backslashes in text nodes,
 * while the `code` branch of `inlineOf` passes `textContent` through untouched.
 * A blind `|` -> `\|` turns an already-doubled `\\|` into `\\\|`... and an
 * already-escaped `` `\|` `` into `\\|`, which GFM reads as a literal backslash
 * followed by a *live* pipe — splitting the cell and leaking the rest of it
 * into the next column.
 *
 * So count the backslashes immediately before each pipe. An even run all pairs
 * off into literal backslashes and leaves the pipe active, which needs one more;
 * an odd run already ends in an escape, which must be left alone.
 */
function cellOf(element: Element): string {
  return inlineOf(element)
    .replace(/\n+/g, " ")
    .replace(/(\\*)\|/g, (_match, slashes: string) =>
      slashes.length % 2 === 0 ? `${slashes}\\|` : `${slashes}|`,
    )
    .trim();
}

function tableBlocks(table: Element): string[] {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.children)
      .filter((cell) => tagOf(cell) === "th" || tagOf(cell) === "td")
      .map(cellOf),
  );
  if (rows.length === 0) return [];
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row: string[]) =>
    `| ${[...row, ...Array(width - row.length).fill("")].join(" | ")} |`;
  const [header, ...body] = rows;
  return [
    [pad(header), `| ${Array(width).fill("---").join(" | ")} |`, ...body.map(pad)].join("\n"),
  ];
}

function listBlocks(list: Element, ordered: boolean, depth: number): string[] {
  const indent = "  ".repeat(depth);
  const items: string[] = [];
  let index = 0;
  for (const item of Array.from(list.children)) {
    if (tagOf(item) !== "li") continue;
    index += 1;
    const marker = ordered ? `${index}. ` : "- ";
    const inner = blocksOf(item, depth + 1);
    if (inner.length === 0) {
      items.push(`${indent}${marker}`);
      continue;
    }
    const [first, ...rest] = inner;
    const continuation = " ".repeat(marker.length);
    items.push(
      [
        `${indent}${marker}${first}`,
        ...rest.map((block) =>
          block
            .split("\n")
            .map((line) => (line.startsWith(indent) ? line : `${indent}${continuation}${line}`))
            .join("\n"),
        ),
      ].join("\n"),
    );
  }
  return items.length > 0 ? [items.join("\n")] : [];
}

function blocksOf(parent: Element, depth = 0): string[] {
  const blocks: string[] = [];
  let inline = "";
  const flush = () => {
    const text = paragraph(inline);
    if (text.trim()) blocks.push(text);
    inline = "";
  };

  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === TEXT_NODE) {
      inline += textOf(child);
      continue;
    }
    if (!isElement(child)) continue;
    const tag = tagOf(child);

    switch (tag) {
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6": {
        flush();
        const text = inlineOf(child).replace(/\s+/g, " ").trim();
        if (text) blocks.push(`${"#".repeat(Number(tag[1]))} ${text}`);
        break;
      }
      case "p":
      case "figcaption": {
        flush();
        const text = paragraph(inlineOf(child));
        if (text.trim()) blocks.push(text);
        break;
      }
      case "hr":
        flush();
        blocks.push("***");
        break;
      case "pre": {
        flush();
        const code = (child.textContent ?? "").replace(/\n+$/, "");
        if (code.trim()) blocks.push(`\`\`\`\n${code}\n\`\`\``);
        break;
      }
      case "blockquote": {
        flush();
        const inner = blocksOf(child, depth);
        if (inner.length > 0) {
          blocks.push(
            inner
              .join("\n\n")
              .split("\n")
              .map((line) => (line ? `> ${line}` : ">"))
              .join("\n"),
          );
        }
        break;
      }
      case "ul":
      case "ol":
        flush();
        blocks.push(...listBlocks(child, tag === "ol", depth));
        break;
      case "table":
        flush();
        blocks.push(...tableBlocks(child));
        break;
      case "img": {
        // A standalone image is its own block; one inside a sentence is not.
        const markdown = imageOf(child);
        if (markdown) {
          flush();
          blocks.push(markdown);
        }
        break;
      }
      case "div":
      case "section":
      case "article":
      case "figure":
      case "li":
        flush();
        blocks.push(...blocksOf(child, depth));
        break;
      default:
        inline += inlineOf(child);
    }
  }
  flush();
  return blocks;
}

/**
 * Sanitize, then convert. Sanitizing first is not decoration: mammoth passes
 * through whatever markup a .docx carries in an embedded HTML altChunk, and the
 * result is stored as manuscript text that later renders in the author's — and,
 * in admin review, someone else's — session. The allowlist below is also what
 * bounds the walker's tag switch.
 */
export function htmlToMarkdown(html: string): string {
  const body = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    RETURN_DOM: true,
  }) as unknown as Element;
  return normalizeImportedMarkdown(blocksOf(body).join("\n\n"));
}

/** Dispatch for the two text formats; .docx is HTML by the time it gets here. */
export function textToMarkdown(source: string, format: Exclude<ImportFormat, "docx">): string {
  return format === "markdown" ? normalizeImportedMarkdown(source) : plainTextToMarkdown(source);
}

/**
 * Decodes an uploaded text file, honouring a UTF-16 byte-order mark. Word and
 * older editors still write "Unicode" .txt files, and reading one as UTF-8
 * produces prose with a NUL between every letter — an import that looks like it
 * worked and is unreadable. Returns null for anything still binary afterwards,
 * which is how a renamed .pdf gets caught.
 */
export function decodeImportedText(bytes: ArrayBuffer): string | null {
  const head = new Uint8Array(bytes.slice(0, 2));
  const encoding =
    head[0] === 0xff && head[1] === 0xfe
      ? "utf-16le"
      : head[0] === 0xfe && head[1] === 0xff
        ? "utf-16be"
        : "utf-8";
  const text = new TextDecoder(encoding).decode(bytes);
  return text.includes("\u0000") ? null : text;
}

/**
 * Filename first, media type second. Browsers disagree about Markdown (some
 * send `text/markdown`, some `text/plain`, Safari sends nothing at all), and
 * the extension is the one thing the author controls.
 */
export function detectImportFormat(
  filename: string,
  mediaType?: string | null,
): ImportFormat | null {
  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  if (extension === "docx") return "docx";
  if (extension === "md" || extension === "markdown" || extension === "mdown") return "markdown";
  if (extension === "txt" || extension === "text") return "text";
  if (extension) return null;

  const type = (mediaType ?? "").split(";")[0].trim().toLowerCase();
  if (type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return "docx";
  }
  if (type === "text/markdown" || type === "text/x-markdown") return "markdown";
  if (type === "text/plain") return "text";
  return null;
}
