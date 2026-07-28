import PDFDocument from "pdfkit/js/pdfkit.standalone.js";
import {
  markdownToBlocks,
  READING_LINE,
  stripInline,
  type AssembledManuscript,
} from "./assemble";
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

export async function exportPdf(m: AssembledManuscript): Promise<ExportResult> {
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

  // Title page.
  doc.font(SERIF).fontSize(26).text(pdfSafe(m.title), MARGIN, 200, {
    width: BODY_WIDTH,
    align: "center",
  });
  if (m.synopsis) {
    doc.moveDown(1.5);
    doc.font(SERIF_ITALIC).fontSize(11).text(pdfSafe(m.synopsis), { width: BODY_WIDTH, align: "center" });
  }
  doc.moveDown(2);
  doc.font(SERIF).fontSize(9).text(pdfSafe(READING_LINE), { width: BODY_WIDTH, align: "center" });
  doc.moveDown(0.5);
  doc.text(pdfSafe(m.author), { width: BODY_WIDTH, align: "center" });

  // Chapters — each opens on a fresh page with a title block.
  for (const chapter of m.chapters) {
    doc.addPage();
    doc
      .font(SERIF)
      .fontSize(10)
      .text(`CHAPTER ${chapter.number}`, MARGIN, 140, {
        width: BODY_WIDTH,
        align: "center",
        characterSpacing: 2,
      });
    if (chapter.title !== `Chapter ${chapter.number}`) {
      doc.moveDown(0.6);
      doc.fontSize(18).text(pdfSafe(chapter.title), { width: BODY_WIDTH, align: "center" });
    }
    doc.moveDown(2);

    for (const block of markdownToBlocks(chapter.markdown)) {
      switch (block.kind) {
        case "heading":
          doc.moveDown(0.6);
          doc.font(SERIF_BOLD).fontSize(13).text(pdfSafe(stripInline(block.text)), {
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
          doc.font(SERIF).fontSize(11).text(pdfSafe(stripInline(block.text)), {
            width: BODY_WIDTH,
            align: "justify",
            indent: 18,
            lineGap: 3,
            paragraphGap: 8,
          });
          break;
      }
    }
  }

  // Page numbers, skipping the title page.
  const range = doc.bufferedPageRange();
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font(SERIF)
      .fontSize(9)
      .text(String(i), 0, PAGE[1] - 36, { width: PAGE[0], align: "center", lineBreak: false });
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
