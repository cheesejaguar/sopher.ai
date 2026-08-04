import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { markdownToBlocks, stripInline, type AssembledManuscript } from "./assemble";
import { closingBookMatter, openingBookMatter } from "@/lib/book-package";
import {
  DEFAULT_PRINT_OPTIONS,
  needsBlankVerso,
  pageFurniture,
  pageOriginShift,
  resolvePrintLayout,
  type PageRole,
  type PrintLayout,
  type PrintOptions,
} from "./print-layout";
import { FORMAT_META, filenameStem, type ExportResult } from "./types";

const SERIF = "Times-Roman";
const SERIF_BOLD = "Times-Bold";
const SERIF_ITALIC = "Times-Italic";

/** The standard fonts are WinAnsi-only; swap the few glyphs prose actually hits. */
function pdfSafe(text: string): string {
  return text
    .replace(/\u2042/g, "* * *")
    .replace(/[\u00a0\u2000-\u200b\u2028\u2029\u202f\u205f]/g, " ");
}

async function fetchCover(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    // A missing cover degrades to the plain title page, never a failed export.
    return null;
  }
}

type RenderedInterior = { buffer: Uint8Array; pageCount: number };

async function renderInterior(
  m: AssembledManuscript,
  cover: Buffer | null,
  layout: PrintLayout,
): Promise<RenderedInterior> {
  const [pageWidth, pageHeight] = layout.size;
  const bodyWidth = layout.bodyWidth;
  const marginLeft = layout.margins.left;
  /** Vertical positions were tuned on 6×9; other trims keep the proportions. */
  const drop = (reference: number) => reference * layout.verticalScale;

  const doc = new PDFDocument({
    size: layout.size,
    margins: layout.margins,
    bufferPages: true,
    info: { Title: m.title, Author: m.author },
  });

  // Every page's role, indexed by page number - 1. pdfkit adds pages on its own
  // whenever text overflows, so the default is set from the event and the pages
  // we add deliberately overwrite it. The constructor already made page one.
  const roles: PageRole[] = ["front"];
  const shiftPageOrigin = () => {
    const shift = pageOriginShift(layout, roles.length);
    if (shift !== 0) doc.translate(shift, 0);
  };
  doc.on("pageAdded", () => {
    roles.push("body");
    shiftPageOrigin();
  });
  shiftPageOrigin();
  const markPage = (role: PageRole) => {
    roles[roles.length - 1] = role;
  };

  const done = new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Cover, full-bleed on its own page, when one was generated. It is the one
  // thing that wants the paper rather than the text block, so it undoes the
  // recto origin shift.
  if (cover) {
    markPage("cover");
    doc.image(cover, 0 - pageOriginShift(layout, 1), 0, {
      cover: [pageWidth, pageHeight],
      align: "center",
      valign: "center",
    });
    doc.addPage();
    markPage("front");
  }

  // Title page.
  doc.font(SERIF).fontSize(26).text(pdfSafe(m.title), marginLeft, drop(200), {
    width: bodyWidth,
    align: "center",
  });
  if (m.matter.subtitle) {
    doc.moveDown(0.8);
    doc
      .font(SERIF)
      .fontSize(15)
      .text(pdfSafe(m.matter.subtitle), { width: bodyWidth, align: "center" });
  }
  if (m.synopsis) {
    doc.moveDown(1.5);
    doc
      .font(SERIF_ITALIC)
      .fontSize(11)
      .text(pdfSafe(m.synopsis), { width: bodyWidth, align: "center" });
  }
  doc.moveDown(2);
  doc
    .font(SERIF)
    .fontSize(9)
    .text(pdfSafe(m.matter.editionName ?? m.editionNote), {
      width: bodyWidth,
      align: "center",
    });
  doc.moveDown(0.5);
  doc.text(pdfSafe(m.author), { width: bodyWidth, align: "center" });

  if (m.matter.copyrightHolder || m.matter.publisher || m.matter.isbn) {
    doc.addPage();
    markPage("front");
    doc.font(SERIF_BOLD).fontSize(16).text("Copyright", marginLeft, drop(150), {
      width: bodyWidth,
      align: "left",
    });
    doc.moveDown(1.5);
    doc.font(SERIF).fontSize(10);
    if (m.matter.copyrightHolder) {
      doc.text(
        pdfSafe(
          m.matter.copyrightYear
            ? `© ${m.matter.copyrightYear} ${m.matter.copyrightHolder}. All rights reserved.`
            : `Copyright © ${m.matter.copyrightHolder}. All rights reserved.`,
        ),
        { width: bodyWidth },
      );
      doc.moveDown(0.5);
    }
    if (m.matter.publisher) {
      doc.text(pdfSafe(`Published by ${m.matter.publisher}.`), { width: bodyWidth });
      doc.moveDown(0.5);
    }
    if (m.matter.isbn) doc.text(pdfSafe(`ISBN ${m.matter.isbn}`), { width: bodyWidth });
  }

  if (m.matter.dedication) {
    doc.addPage();
    markPage("front");
    doc.font(SERIF_ITALIC).fontSize(13).text(pdfSafe(m.matter.dedication), marginLeft, drop(240), {
      width: bodyWidth,
      align: "center",
    });
  }

  if (m.matter.epigraphText) {
    doc.addPage();
    markPage("front");
    doc
      .font(SERIF_ITALIC)
      .fontSize(12)
      .text(pdfSafe(m.matter.epigraphText), marginLeft + 30, drop(210), {
        width: bodyWidth - 60,
        align: "left",
        lineGap: 3,
      });
    if (m.matter.epigraphAttribution) {
      doc.moveDown(1);
      doc
        .font(SERIF)
        .fontSize(10)
        .text(pdfSafe(`— ${m.matter.epigraphAttribution}`), {
          width: bodyWidth - 60,
          align: "right",
        });
    }
  }

  const renderMatter = (title: string, markdown: string, role: PageRole) => {
    doc.addPage();
    markPage(role);
    doc.font(SERIF_BOLD).fontSize(18).text(pdfSafe(title), marginLeft, drop(120), {
      width: bodyWidth,
      align: "center",
    });
    doc.moveDown(2);
    for (const block of markdownToBlocks(markdown, m.figures)) {
      if (block.kind === "scene-break") {
        doc.moveDown(0.5);
        doc.font(SERIF).fontSize(11).text("* * *", { width: bodyWidth, align: "center" });
        doc.moveDown(0.5);
      } else if (block.kind === "heading") {
        doc.moveDown(0.5);
        doc
          .font(SERIF_BOLD)
          .fontSize(13)
          .text(pdfSafe(stripInline(block.text)), {
            width: bodyWidth,
          });
        doc.moveDown(0.25);
      } else if (block.kind === "quote") {
        doc
          .font(SERIF_ITALIC)
          .fontSize(11)
          .text(pdfSafe(stripInline(block.text)), {
            width: bodyWidth,
            align: "justify",
            paragraphGap: 8,
          });
      } else if (block.kind === "paragraph" || block.kind === "code") {
        doc
          .font(block.kind === "code" ? "Courier" : SERIF)
          .fontSize(block.kind === "code" ? 8 : 11)
          .text(pdfSafe(stripInline(block.text)), {
            width: bodyWidth,
            align: block.kind === "code" ? "left" : "justify",
            lineGap: 3,
            paragraphGap: 8,
          });
      } else if (block.kind === "figure" && block.figure.pngBytes) {
        doc.moveDown(0.8);
        doc.image(Buffer.from(block.figure.pngBytes), {
          fit: [bodyWidth, drop(320)],
          align: "center",
        });
        doc.moveDown(0.8);
      }
    }
  };

  for (const section of openingBookMatter(m.matter)) {
    renderMatter(section.title, section.markdown, "front");
  }

  // Chapters — each opens on a fresh page with a title block.
  let firstNumberedPageIndex: number | null = null;
  for (const chapter of m.chapters) {
    if (layout.options.rectoChapterStarts && needsBlankVerso(roles.length + 1)) {
      doc.addPage();
      markPage("blank");
    }
    doc.addPage();
    markPage("opening");
    if (firstNumberedPageIndex === null) firstNumberedPageIndex = roles.length - 1;
    doc.font(SERIF).fontSize(10).text(`CHAPTER ${chapter.number}`, marginLeft, drop(140), {
      width: bodyWidth,
      align: "center",
      characterSpacing: 2,
    });
    if (chapter.title !== `Chapter ${chapter.number}`) {
      doc.moveDown(0.6);
      doc.fontSize(18).text(pdfSafe(chapter.title), { width: bodyWidth, align: "center" });
    }
    doc.moveDown(2);

    for (const block of markdownToBlocks(chapter.markdown, m.figures)) {
      switch (block.kind) {
        case "heading":
          doc.moveDown(0.6);
          doc
            .font(SERIF_BOLD)
            .fontSize(13)
            .text(pdfSafe(stripInline(block.text)), {
              width: bodyWidth,
              align: "left",
            });
          doc.moveDown(0.3);
          break;
        case "quote":
          doc
            .font(SERIF_ITALIC)
            .fontSize(11)
            .text(pdfSafe(stripInline(block.text)), doc.page.margins.left + 24, doc.y, {
              width: bodyWidth - 48,
              align: "justify",
              lineGap: 3,
              paragraphGap: 8,
            });
          doc.x = doc.page.margins.left;
          break;
        case "scene-break":
          doc.moveDown(0.5);
          doc.font(SERIF).fontSize(11).text("* * *", { width: bodyWidth, align: "center" });
          doc.moveDown(0.5);
          break;
        case "paragraph":
          doc
            .font(SERIF)
            .fontSize(11)
            .text(pdfSafe(stripInline(block.text)), {
              width: bodyWidth,
              align: "justify",
              indent: 18,
              lineGap: 3,
              paragraphGap: 8,
            });
          break;
        case "figure": {
          const { pngBytes, alt } = block.figure;
          if (!pngBytes) break;
          doc.moveDown(0.8);
          // fit() keeps the aspect ratio and never overflows the text block.
          doc.image(Buffer.from(pngBytes), { fit: [bodyWidth, drop(320)], align: "center" });
          doc.moveDown(0.4);
          doc
            .font(SERIF_ITALIC)
            .fontSize(9)
            .text(pdfSafe(alt), { width: bodyWidth, align: "center" });
          doc.moveDown(0.8);
          break;
        }
        case "code":
          // Only reached when a diagram has no cached render. Monospace-ish
          // fallback so the content survives even if it is not pretty.
          doc.moveDown(0.5);
          doc
            .font("Courier")
            .fontSize(8)
            .text(pdfSafe(block.text), { width: bodyWidth, align: "left", lineGap: 1 });
          doc.moveDown(0.5);
          break;
      }
    }
  }

  for (const section of closingBookMatter(m.matter)) {
    renderMatter(section.title, section.markdown, "opening");
  }

  // Running heads and folios go on last, once every page exists. Page numbers
  // begin on chapter one, regardless of cover/front-matter count.
  const range = doc.bufferedPageRange();
  const pageCount = range.start + range.count;
  for (let index = range.start; index < pageCount; index += 1) {
    const folio =
      firstNumberedPageIndex === null || index < firstNumberedPageIndex
        ? null
        : index - firstNumberedPageIndex + 1;
    const furniture = pageFurniture(layout, {
      pageNumber: index + 1,
      role: roles[index] ?? "body",
      folio,
      title: m.title,
      author: m.author,
    });
    if (!furniture.head && !furniture.folio) continue;

    doc.switchToPage(index);
    // Furniture lives in the margins, which the text flow would otherwise treat
    // as past the bottom of the page and break onto a new one.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(SERIF).fontSize(9);
    if (furniture.head) {
      doc.text(pdfSafe(furniture.head.text), furniture.head.x, layout.runningHeadY, {
        width: furniture.head.width,
        align: furniture.head.align,
        lineBreak: false,
      });
    }
    if (furniture.folio) {
      doc.text(furniture.folio.text, furniture.folio.x, layout.folioY, {
        width: furniture.folio.width,
        align: furniture.folio.align,
        lineBreak: false,
      });
    }
    doc.page.margins.bottom = bottom;
  }

  doc.end();
  return { buffer: await done, pageCount };
}

/** Renders at most this many times while the gutter tier is still settling. */
const MAX_LAYOUT_PASSES = 3;

export async function exportPdf(
  m: AssembledManuscript,
  options: PrintOptions = DEFAULT_PRINT_OPTIONS,
): Promise<ExportResult> {
  const cover = await fetchCover(m.coverUrl);

  // The gutter widens with page count and narrows the measure, which can push
  // the book into the next tier, so the first pass is an estimate. Gutters only
  // ever grow here, so re-rendering until the tier stops moving terminates —
  // and without mirrored margins the gutter is always zero and one pass is all
  // that ever runs.
  let layout = resolvePrintLayout(options);
  let rendered = await renderInterior(m, cover, layout);
  for (let pass = 1; pass < MAX_LAYOUT_PASSES; pass += 1) {
    const settled = resolvePrintLayout(options, rendered.pageCount);
    if (settled.gutter <= layout.gutter) break;
    layout = settled;
    rendered = await renderInterior(m, cover, layout);
  }

  const meta = FORMAT_META.pdf;
  return {
    buffer: rendered.buffer,
    contentType: meta.contentType,
    filename: `${filenameStem(m.title)}.${meta.extension}`,
  };
}
