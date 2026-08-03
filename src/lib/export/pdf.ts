import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import { markdownToBlocks, stripInline, type AssembledManuscript } from "./assemble";
import { closingBookMatter, openingBookMatter } from "@/lib/book-package";
import { FORMAT_META, filenameStem, type ExportResult } from "./types";

// 6in × 9in trade page, in PDF points.
const PAGE: [number, number] = [432, 648];
const MARGIN = 54;
const BODY_WIDTH = PAGE[0] - MARGIN * 2;

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

export async function exportPdf(m: AssembledManuscript): Promise<ExportResult> {
  const cover = await fetchCover(m.coverUrl);
  const doc = new PDFDocument({
    size: PAGE,
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    bufferPages: true,
    info: { Title: m.title, Author: m.author },
  });

  const done = new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // Cover, full-bleed on its own page, when one was generated.
  if (cover) {
    doc.image(cover, 0, 0, { cover: [PAGE[0], PAGE[1]], align: "center", valign: "center" });
    doc.addPage();
  }

  // Title page.
  doc.font(SERIF).fontSize(26).text(pdfSafe(m.title), MARGIN, 200, {
    width: BODY_WIDTH,
    align: "center",
  });
  if (m.matter.subtitle) {
    doc.moveDown(0.8);
    doc
      .font(SERIF)
      .fontSize(15)
      .text(pdfSafe(m.matter.subtitle), { width: BODY_WIDTH, align: "center" });
  }
  if (m.synopsis) {
    doc.moveDown(1.5);
    doc
      .font(SERIF_ITALIC)
      .fontSize(11)
      .text(pdfSafe(m.synopsis), { width: BODY_WIDTH, align: "center" });
  }
  doc.moveDown(2);
  doc
    .font(SERIF)
    .fontSize(9)
    .text(pdfSafe(m.matter.editionName ?? m.editionNote), {
      width: BODY_WIDTH,
      align: "center",
    });
  doc.moveDown(0.5);
  doc.text(pdfSafe(m.author), { width: BODY_WIDTH, align: "center" });

  if (m.matter.copyrightHolder || m.matter.publisher || m.matter.isbn) {
    doc.addPage();
    doc.font(SERIF_BOLD).fontSize(16).text("Copyright", MARGIN, 150, {
      width: BODY_WIDTH,
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
        { width: BODY_WIDTH },
      );
      doc.moveDown(0.5);
    }
    if (m.matter.publisher) {
      doc.text(pdfSafe(`Published by ${m.matter.publisher}.`), { width: BODY_WIDTH });
      doc.moveDown(0.5);
    }
    if (m.matter.isbn) doc.text(pdfSafe(`ISBN ${m.matter.isbn}`), { width: BODY_WIDTH });
  }

  if (m.matter.dedication) {
    doc.addPage();
    doc.font(SERIF_ITALIC).fontSize(13).text(pdfSafe(m.matter.dedication), MARGIN, 240, {
      width: BODY_WIDTH,
      align: "center",
    });
  }

  if (m.matter.epigraphText) {
    doc.addPage();
    doc
      .font(SERIF_ITALIC)
      .fontSize(12)
      .text(pdfSafe(m.matter.epigraphText), MARGIN + 30, 210, {
        width: BODY_WIDTH - 60,
        align: "left",
        lineGap: 3,
      });
    if (m.matter.epigraphAttribution) {
      doc.moveDown(1);
      doc
        .font(SERIF)
        .fontSize(10)
        .text(pdfSafe(`— ${m.matter.epigraphAttribution}`), {
          width: BODY_WIDTH - 60,
          align: "right",
        });
    }
  }

  const renderMatter = (title: string, markdown: string) => {
    doc.addPage();
    doc.font(SERIF_BOLD).fontSize(18).text(pdfSafe(title), MARGIN, 120, {
      width: BODY_WIDTH,
      align: "center",
    });
    doc.moveDown(2);
    for (const block of markdownToBlocks(markdown, m.figures)) {
      if (block.kind === "scene-break") {
        doc.moveDown(0.5);
        doc.font(SERIF).fontSize(11).text("* * *", { width: BODY_WIDTH, align: "center" });
        doc.moveDown(0.5);
      } else if (block.kind === "heading") {
        doc.moveDown(0.5);
        doc
          .font(SERIF_BOLD)
          .fontSize(13)
          .text(pdfSafe(stripInline(block.text)), {
            width: BODY_WIDTH,
          });
        doc.moveDown(0.25);
      } else if (block.kind === "quote") {
        doc
          .font(SERIF_ITALIC)
          .fontSize(11)
          .text(pdfSafe(stripInline(block.text)), {
            width: BODY_WIDTH,
            align: "justify",
            paragraphGap: 8,
          });
      } else if (block.kind === "paragraph" || block.kind === "code") {
        doc
          .font(block.kind === "code" ? "Courier" : SERIF)
          .fontSize(block.kind === "code" ? 8 : 11)
          .text(pdfSafe(stripInline(block.text)), {
            width: BODY_WIDTH,
            align: block.kind === "code" ? "left" : "justify",
            lineGap: 3,
            paragraphGap: 8,
          });
      } else if (block.kind === "figure" && block.figure.pngBytes) {
        doc.moveDown(0.8);
        doc.image(Buffer.from(block.figure.pngBytes), {
          fit: [BODY_WIDTH, 320],
          align: "center",
        });
        doc.moveDown(0.8);
      }
    }
  };

  for (const section of openingBookMatter(m.matter)) {
    renderMatter(section.title, section.markdown);
  }

  // Chapters — each opens on a fresh page with a title block.
  let firstNumberedPageIndex: number | null = null;
  for (const chapter of m.chapters) {
    doc.addPage();
    if (firstNumberedPageIndex === null) {
      const range = doc.bufferedPageRange();
      firstNumberedPageIndex = range.start + range.count - 1;
    }
    doc.font(SERIF).fontSize(10).text(`CHAPTER ${chapter.number}`, MARGIN, 140, {
      width: BODY_WIDTH,
      align: "center",
      characterSpacing: 2,
    });
    if (chapter.title !== `Chapter ${chapter.number}`) {
      doc.moveDown(0.6);
      doc.fontSize(18).text(pdfSafe(chapter.title), { width: BODY_WIDTH, align: "center" });
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
              width: BODY_WIDTH,
              align: "left",
            });
          doc.moveDown(0.3);
          break;
        case "quote":
          doc
            .font(SERIF_ITALIC)
            .fontSize(11)
            .text(pdfSafe(stripInline(block.text)), doc.page.margins.left + 24, doc.y, {
              width: BODY_WIDTH - 48,
              align: "justify",
              lineGap: 3,
              paragraphGap: 8,
            });
          doc.x = doc.page.margins.left;
          break;
        case "scene-break":
          doc.moveDown(0.5);
          doc.font(SERIF).fontSize(11).text("* * *", { width: BODY_WIDTH, align: "center" });
          doc.moveDown(0.5);
          break;
        case "paragraph":
          doc
            .font(SERIF)
            .fontSize(11)
            .text(pdfSafe(stripInline(block.text)), {
              width: BODY_WIDTH,
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
          doc.image(Buffer.from(pngBytes), { fit: [BODY_WIDTH, 320], align: "center" });
          doc.moveDown(0.4);
          doc
            .font(SERIF_ITALIC)
            .fontSize(9)
            .text(pdfSafe(alt), { width: BODY_WIDTH, align: "center" });
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
            .text(pdfSafe(block.text), { width: BODY_WIDTH, align: "left", lineGap: 1 });
          doc.moveDown(0.5);
          break;
      }
    }
  }

  for (const section of closingBookMatter(m.matter)) {
    renderMatter(section.title, section.markdown);
  }

  // Page numbers begin on chapter one, regardless of cover/front-matter count.
  const range = doc.bufferedPageRange();
  for (
    let i = firstNumberedPageIndex ?? range.start + range.count;
    i < range.start + range.count;
    i++
  ) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font(SERIF)
      .fontSize(9)
      .text(String(i - (firstNumberedPageIndex ?? i) + 1), 0, PAGE[1] - 36, {
        width: PAGE[0],
        align: "center",
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }

  doc.end();
  const buffer = await done;

  const meta = FORMAT_META.pdf;
  return {
    buffer,
    contentType: meta.contentType,
    filename: `${filenameStem(m.title)}.${meta.extension}`,
  };
}
