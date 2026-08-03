import {
  AlignmentType,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  ImageRun,
  Paragraph,
  TextRun,
  convertInchesToTwip,
  type ISectionOptions,
} from "docx";
import {
  chapterHeading,
  markdownToBlocks,
  parseInline,
  type AssembledManuscript,
  type ProseBlock,
} from "./assemble";
import { closingBookMatter, openingBookMatter, type BookMatterSection } from "@/lib/book-package";
import { fitWidth } from "./figures";
import { FORMAT_META, filenameStem, type ExportResult } from "./types";

const SERIF = "Georgia";
const BODY_SIZE = 24; // half-points → 12pt

function runsFor(text: string, extra?: { italics?: boolean }): TextRun[] {
  return parseInline(text).map(
    (segment) =>
      new TextRun({
        text: segment.text,
        bold: segment.bold,
        italics: segment.italic || extra?.italics,
      }),
  );
}

function blockToParagraph(block: ProseBlock): Paragraph {
  switch (block.kind) {
    case "heading":
      return new Paragraph({
        heading: block.depth === 1 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
        spacing: { before: 320, after: 160 },
        children: runsFor(block.text),
      });
    case "quote":
      return new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { left: convertInchesToTwip(0.5) },
        spacing: { before: 160, after: 160 },
        children: runsFor(block.text, { italics: true }),
      });
    case "scene-break":
      return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240 },
        children: [new TextRun({ text: "⁂" })],
      });
    case "paragraph":
      return new Paragraph({
        alignment: AlignmentType.JUSTIFIED,
        indent: { firstLine: convertInchesToTwip(0.3) },
        spacing: { after: 120 },
        children: runsFor(block.text),
      });
    case "figure": {
      const { pngBytes, width, height, alt } = block.figure;
      if (!pngBytes || !width || !height) {
        // No cached render — keep the alt text so the figure is not silently lost.
        return new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 160, after: 160 },
          children: [new TextRun({ text: alt, italics: true })],
        });
      }
      // 6in usable width at 96dpi; scale down only when the image exceeds it.
      const fitted = fitWidth({ width, height }, 576);
      return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 240, after: 240 },
        children: [
          new ImageRun({
            type: "png",
            data: pngBytes,
            transformation: fitted,
            altText: { name: alt, description: alt, title: alt },
          }),
        ],
      });
    }
    case "code":
      return new Paragraph({
        spacing: { before: 160, after: 160 },
        children: [new TextRun({ text: block.text, font: "Consolas", size: 18 })],
      });
  }
}

function frontMatterSection(m: AssembledManuscript): ISectionOptions {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 2800, after: 400 },
      children: [new TextRun({ text: m.title, size: 56, bold: true })],
    }),
  ];
  if (m.matter.subtitle) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({ text: m.matter.subtitle, size: 30 })],
      }),
    );
  }
  if (m.synopsis) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [new TextRun({ text: m.synopsis, italics: true })],
      }),
    );
  }
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [
        new TextRun({ text: m.matter.editionName ?? m.editionNote, italics: true, size: 20 }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: m.author, size: 20 })],
    }),
  );
  if (m.matter.copyrightHolder || m.matter.publisher || m.matter.isbn) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        children: [new TextRun({ text: "Copyright" })],
      }),
    );
    if (m.matter.copyrightHolder) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: m.matter.copyrightYear
                ? `© ${m.matter.copyrightYear} ${m.matter.copyrightHolder}. All rights reserved.`
                : `Copyright © ${m.matter.copyrightHolder}. All rights reserved.`,
            }),
          ],
        }),
      );
    }
    if (m.matter.publisher) {
      children.push(new Paragraph({ text: `Published by ${m.matter.publisher}.` }));
    }
    if (m.matter.isbn) children.push(new Paragraph({ text: `ISBN ${m.matter.isbn}` }));
  }
  if (m.matter.dedication) {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        alignment: AlignmentType.CENTER,
        spacing: { before: 2400 },
        children: [new TextRun({ text: m.matter.dedication, italics: true, size: 24 })],
      }),
    );
  }
  if (m.matter.epigraphText) {
    children.push(
      new Paragraph({
        pageBreakBefore: true,
        spacing: { before: 1800, after: 240 },
        children: [new TextRun({ text: m.matter.epigraphText, italics: true, size: 24 })],
      }),
    );
    if (m.matter.epigraphAttribution) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({ text: `— ${m.matter.epigraphAttribution}`, size: 20 })],
        }),
      );
    }
  }
  for (const section of openingBookMatter(m.matter)) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        pageBreakBefore: true,
        children: [new TextRun({ text: section.title })],
      }),
      ...markdownToBlocks(section.markdown, m.figures).map(blockToParagraph),
    );
  }
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      pageBreakBefore: true,
      spacing: { after: 240 },
      children: [new TextRun({ text: "Contents" })],
    }),
    ...m.chapters.map(
      (chapter) =>
        new Paragraph({
          spacing: { after: 80 },
          children: [new TextRun({ text: `${chapter.number}. ${chapter.title}` })],
        }),
    ),
  );
  return { children };
}

function matterSection(m: AssembledManuscript, section: BookMatterSection): ISectionOptions {
  return {
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })],
          }),
        ],
      }),
    },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 800, after: 360 },
        children: [new TextRun({ text: section.title })],
      }),
      ...markdownToBlocks(section.markdown, m.figures).map(blockToParagraph),
    ],
  };
}

function chapterSection(m: AssembledManuscript, index: number): ISectionOptions {
  const chapter = m.chapters[index];
  return {
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ children: [PageNumber.CURRENT], size: 18 })],
          }),
        ],
      }),
    },
    children: [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { before: 1200, after: 480 },
        children: [new TextRun({ text: chapterHeading(chapter) })],
      }),
      ...markdownToBlocks(chapter.markdown, m.figures).map(blockToParagraph),
    ],
  };
}

export async function exportDocx(m: AssembledManuscript): Promise<ExportResult> {
  const doc = new Document({
    creator: m.author,
    title: m.title,
    description: m.synopsis ?? undefined,
    styles: {
      default: {
        document: { run: { font: SERIF, size: BODY_SIZE } },
        heading1: {
          run: { font: SERIF, size: 36, bold: true, color: "000000" },
        },
        heading2: {
          run: { font: SERIF, size: 30, bold: true, color: "000000" },
        },
        heading3: {
          run: { font: SERIF, size: 26, bold: true, color: "000000" },
        },
      },
    },
    sections: [
      frontMatterSection(m),
      ...m.chapters.map((_, i) => chapterSection(m, i)),
      ...closingBookMatter(m.matter).map((section) => matterSection(m, section)),
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  const meta = FORMAT_META.docx;
  return {
    buffer,
    contentType: meta.contentType,
    filename: `${filenameStem(m.title)}.${meta.extension}`,
  };
}
