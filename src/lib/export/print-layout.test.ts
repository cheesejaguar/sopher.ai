import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { buildManuscript } from "./assemble";
import { exportPdf } from "./pdf";
import {
  DEFAULT_PRINT_OPTIONS,
  gutterForPageCount,
  isRecto,
  kdpMinimumInsideMargin,
  marginsForPage,
  needsBlankVerso,
  pageFurniture,
  pageOriginShift,
  parsePrintOptions,
  printOptionsSchema,
  resolvePrintLayout,
  TRIM_SIZES,
  type PrintOptions,
} from "./print-layout";

/** The geometry exports shipped with, before print options existed. */
const LEGACY = { width: 432, height: 648, margin: 54, bodyWidth: 324, folioY: 612 };

const printOptions = (overrides: Partial<PrintOptions> = {}): PrintOptions => ({
  ...DEFAULT_PRINT_OPTIONS,
  ...overrides,
});

describe("print option parsing", () => {
  it("turns an absent option set into today's geometry", () => {
    expect(parsePrintOptions(undefined)).toEqual({
      trim: "6x9",
      bindingMargins: false,
      runningHeads: false,
      rectoChapterStarts: false,
    });
    expect(parsePrintOptions(undefined)).toEqual(DEFAULT_PRINT_OPTIONS);
  });

  it("keeps the schema defaults and the shared contract in step", () => {
    expect(printOptionsSchema.parse({})).toEqual(DEFAULT_PRINT_OPTIONS);
  });

  it("defaults each field independently", () => {
    expect(parsePrintOptions({ trim: "5x8" })).toEqual({
      ...DEFAULT_PRINT_OPTIONS,
      trim: "5x8",
    });
  });

  it("falls back rather than failing an export whose work is already paid for", () => {
    expect(parsePrintOptions({ trim: "a4" })).toEqual(DEFAULT_PRINT_OPTIONS);
    expect(parsePrintOptions("nonsense")).toEqual(DEFAULT_PRINT_OPTIONS);
    expect(parsePrintOptions(null)).toEqual(DEFAULT_PRINT_OPTIONS);
  });
});

describe("default preset geometry", () => {
  const layout = resolvePrintLayout(DEFAULT_PRINT_OPTIONS);

  it("reproduces the page and margins exports already have", () => {
    expect(layout.size).toEqual([LEGACY.width, LEGACY.height]);
    expect(layout.margins).toEqual({
      top: LEGACY.margin,
      bottom: LEGACY.margin,
      left: LEGACY.margin,
      right: LEGACY.margin,
    });
    expect(layout.bodyWidth).toBe(LEGACY.bodyWidth);
  });

  it("puts the folio exactly where the old centred page number sat", () => {
    expect(layout.folioY).toBe(LEGACY.folioY);
    expect(layout.folioY).toBe(LEGACY.height - 36);
  });

  it("scales the 6x9-tuned vertical positions by exactly one", () => {
    // Not "close to 1" — the drop positions multiply through it, so any drift
    // would move the title page a hair and change the bytes.
    expect(layout.verticalScale).toBe(1);
    expect(200 * layout.verticalScale).toBe(200);
  });

  it("mirrors nothing and shifts nothing without binding margins", () => {
    expect(layout.gutter).toBe(0);
    for (const page of [1, 2, 3, 4]) {
      expect(pageOriginShift(layout, page)).toBe(0);
      expect(marginsForPage(layout, page)).toEqual(layout.margins);
    }
  });

  it("keeps the folio centred on the trim, as it always was", () => {
    const { head, folio } = pageFurniture(layout, {
      pageNumber: 7,
      role: "body",
      folio: 3,
      title: "The Salt Road",
      author: "M. Okonjo",
    });
    expect(head).toBeNull();
    expect(folio).toEqual({ text: "3", x: 0, width: LEGACY.width, align: "center" });
  });

  it("still numbers chapter openings, the way it did before", () => {
    const { folio } = pageFurniture(layout, {
      pageNumber: 5,
      role: "opening",
      folio: 1,
      title: "The Salt Road",
      author: "M. Okonjo",
    });
    expect(folio?.text).toBe("1");
  });
});

describe("trim presets", () => {
  it("sizes every preset at 72 points to the inch", () => {
    expect(TRIM_SIZES["5x8"].size).toEqual([360, 576]);
    expect(TRIM_SIZES["5.5x8.5"].size).toEqual([396, 612]);
    expect(TRIM_SIZES["6x9"].size).toEqual([432, 648]);
    expect(TRIM_SIZES["8.5x11"].size).toEqual([612, 792]);
  });

  it("holds the margins steady so a narrower trim narrows the measure", () => {
    const layout = resolvePrintLayout(printOptions({ trim: "5x8" }));
    expect(layout.size).toEqual([360, 576]);
    expect(layout.bodyWidth).toBe(360 - 108);
    expect(layout.margins.top).toBe(54);
  });

  it("moves the folio with the page foot", () => {
    const proof = resolvePrintLayout(printOptions({ trim: "8.5x11" }));
    expect(proof.folioY).toBe(792 - 36);
    expect(proof.verticalScale).toBeCloseTo(792 / 648, 10);
  });
});

describe("KDP gutter tiers", () => {
  it("matches KDP's minimum inside margin at every tier boundary", () => {
    expect(kdpMinimumInsideMargin(150)).toBe(27);
    expect(kdpMinimumInsideMargin(151)).toBe(36);
    expect(kdpMinimumInsideMargin(300)).toBe(36);
    expect(kdpMinimumInsideMargin(301)).toBe(45);
    expect(kdpMinimumInsideMargin(500)).toBe(45);
    expect(kdpMinimumInsideMargin(501)).toBe(54);
    expect(kdpMinimumInsideMargin(700)).toBe(54);
    expect(kdpMinimumInsideMargin(701)).toBe(63);
  });

  it("grows the gutter one step per tier and never shrinks it", () => {
    const counts = [1, 24, 150, 151, 300, 301, 500, 501, 700, 701, 828];
    const gutters = counts.map(gutterForPageCount);
    expect(gutters).toEqual([0, 0, 0, 9, 9, 18, 18, 27, 27, 36, 36]);
    for (let i = 1; i < gutters.length; i += 1) {
      expect(gutters[i]).toBeGreaterThanOrEqual(gutters[i - 1]);
    }
  });

  it("clears KDP's minimum at every tier once the base margin is included", () => {
    for (const pages of [1, 150, 151, 300, 301, 500, 501, 700, 701, 1200]) {
      const layout = resolvePrintLayout(printOptions({ bindingMargins: true }), pages);
      expect(layout.inside).toBeGreaterThanOrEqual(kdpMinimumInsideMargin(pages));
    }
  });

  it("treats an unknown page count as the shortest tier", () => {
    const layout = resolvePrintLayout(printOptions({ bindingMargins: true }));
    expect(layout.gutter).toBe(0);
    expect(resolvePrintLayout(printOptions({ bindingMargins: true }), 0).gutter).toBe(0);
    expect(resolvePrintLayout(printOptions({ bindingMargins: true }), Number.NaN).gutter).toBe(0);
  });

  it("ignores page count entirely when binding margins are off", () => {
    expect(resolvePrintLayout(DEFAULT_PRINT_OPTIONS, 900).gutter).toBe(0);
    expect(resolvePrintLayout(DEFAULT_PRINT_OPTIONS, 900).inside).toBe(54);
  });
});

describe("margin mirroring by page parity", () => {
  const layout = resolvePrintLayout(printOptions({ bindingMargins: true }), 400);

  it("puts the wider margin on the binding edge of each parity", () => {
    expect(layout.gutter).toBe(18);
    expect(layout.inside).toBe(72);
    expect(layout.outside).toBe(54);
    // Recto is a right-hand page: its spine, and so its inside margin, is left.
    expect(marginsForPage(layout, 1)).toEqual({ top: 54, bottom: 54, left: 72, right: 54 });
    expect(marginsForPage(layout, 2)).toEqual({ top: 54, bottom: 54, left: 54, right: 72 });
    expect(marginsForPage(layout, 11)).toEqual(marginsForPage(layout, 1));
    expect(marginsForPage(layout, 12)).toEqual(marginsForPage(layout, 2));
  });

  it("keeps the measure identical on both parities so pagination cannot drift", () => {
    for (const page of [1, 2, 3, 4, 99, 100]) {
      const margins = marginsForPage(layout, page);
      expect(TRIM_SIZES["6x9"].size[0] - margins.left - margins.right).toBe(layout.bodyWidth);
    }
    expect(layout.bodyWidth).toBe(432 - 72 - 54);
  });

  it("shifts only the recto origin, by exactly the gutter", () => {
    expect(pageOriginShift(layout, 1)).toBe(18);
    expect(pageOriginShift(layout, 2)).toBe(0);
    expect(pageOriginShift(layout, 3)).toBe(18);
    // The shift plus the flowed left margin is what a preflight actually measures.
    expect(pageOriginShift(layout, 1) + layout.margins.left).toBe(marginsForPage(layout, 1).left);
    expect(pageOriginShift(layout, 2) + layout.margins.left).toBe(marginsForPage(layout, 2).left);
  });

  it("keeps a centred folio centred on the paper when heads are off", () => {
    const { folio } = pageFurniture(layout, {
      pageNumber: 3,
      role: "body",
      folio: 2,
      title: "The Salt Road",
      author: "M. Okonjo",
    });
    // Drawn in the shifted space, so it has to walk the shift back off.
    expect(folio).toEqual({ text: "2", x: -18, width: 432, align: "center" });
  });
});

describe("recto chapter starts", () => {
  it("reads page one of the block as a recto", () => {
    expect(isRecto(1)).toBe(true);
    expect(isRecto(2)).toBe(false);
    expect(isRecto(101)).toBe(true);
  });

  it("inserts a blank only when the chapter would land on a verso", () => {
    // A chapter following a 6-page front matter would open on page 7: a recto.
    expect(needsBlankVerso(7)).toBe(false);
    // Following a 7-page front matter it would open on page 8: a verso.
    expect(needsBlankVerso(8)).toBe(true);
  });

  it("lands the chapter on a recto once the blank is counted", () => {
    let nextPage = 8;
    if (needsBlankVerso(nextPage)) nextPage += 1;
    expect(isRecto(nextPage)).toBe(true);
    expect(nextPage).toBe(9);
  });
});

describe("running heads and folios", () => {
  const layout = resolvePrintLayout(
    printOptions({ bindingMargins: true, runningHeads: true }),
    400,
  );
  const page = (
    pageNumber: number,
    role: Parameters<typeof pageFurniture>[1]["role"],
    folio: number | null,
  ) =>
    pageFurniture(layout, {
      pageNumber,
      role,
      folio,
      title: "The Salt Road",
      author: "M. Okonjo",
    });

  it("puts the author on versos and the title on rectos", () => {
    expect(page(2, "body", 2).head?.text).toBe("M. Okonjo");
    expect(page(3, "body", 3).head?.text).toBe("The Salt Road");
  });

  it("centres the head on the text block, on both parities", () => {
    expect(page(2, "body", 2).head).toEqual({
      text: "M. Okonjo",
      x: layout.outside,
      width: layout.bodyWidth,
      align: "center",
    });
    expect(page(3, "body", 3).head?.x).toBe(layout.outside);
  });

  it("aligns folios to the outside edge of each parity", () => {
    expect(page(2, "body", 2).folio?.align).toBe("left");
    expect(page(3, "body", 3).folio?.align).toBe("right");
    expect(page(3, "body", 3).folio?.width).toBe(layout.bodyWidth);
  });

  it("suppresses both on chapter openings", () => {
    expect(page(5, "opening", 1)).toEqual({ head: null, folio: null });
  });

  it("suppresses both on front matter, the cover, and inserted blanks", () => {
    expect(page(1, "cover", null)).toEqual({ head: null, folio: null });
    expect(page(2, "front", null)).toEqual({ head: null, folio: null });
    expect(page(4, "blank", 3)).toEqual({ head: null, folio: null });
  });

  it("suppresses everything before chapter one, whatever the role says", () => {
    expect(page(3, "body", null)).toEqual({ head: null, folio: null });
  });

  it("sits the head above the text block and the folio below it", () => {
    expect(layout.runningHeadY).toBeLessThan(layout.margins.top);
    expect(layout.folioY).toBeGreaterThan(layout.size[1] - layout.margins.bottom);
    expect(layout.folioY).toBeLessThan(layout.size[1]);
  });
});

// ---------------------------------------------------------------------------
// The layout is only worth anything if the renderer honours it, and the two
// behaviours that cannot be checked from pure geometry — the parity origin
// shift and the inserted blank verso — only exist in the rendered bytes.
// ---------------------------------------------------------------------------

const sentence =
  "The ferry came in low against the tide, salt on every rope and the light going out of the water. ";

const longBook = buildManuscript({
  title: "The Salt Road",
  author: "M. Okonjo",
  matter: { author: "M. Okonjo", dedication: "For the crossing." },
  chapters: Array.from({ length: 20 }, (_, index) => ({
    number: index + 1,
    title: `Crossing ${index + 1}`,
    // Uneven chapters, so some of them would land on a verso without help.
    content: Array.from({ length: 18 + (index % 3) * 2 }, () => sentence.repeat(6)).join("\n\n"),
  })),
});

/** Every page's content stream, inflated, in page order. */
function pageStreams(bytes: Uint8Array): string[] {
  const raw = Buffer.from(bytes);
  const text = raw.toString("latin1");
  const streams: string[] = [];
  const opening = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  while ((match = opening.exec(text)) !== null) {
    const start = match.index + match[0].length;
    const end = text.indexOf("\nendstream", start);
    if (end < 0) continue;
    try {
      const inflated = inflateSync(raw.subarray(start, end)).toString("latin1");
      // A page stream always opens with pdfkit's y-flip; no other stream does.
      if (/^1 0 0 -1 0 \d+(\.\d+)? cm/.test(inflated)) streams.push(inflated);
    } catch {
      // Not every stream in the file is deflate; those are not pages.
    }
  }
  return streams;
}

describe("rendered interior", () => {
  it("writes no origin shift at all with today's defaults", async () => {
    const result = await exportPdf(longBook);
    expect(Buffer.from(result.buffer).toString("latin1").slice(0, 5)).toBe("%PDF-");
    const streams = pageStreams(result.buffer);
    expect(streams.length).toBeGreaterThan(100);
    expect(streams.join("\n")).not.toMatch(/1 0 0 1 \d+ 0 cm/);
  });

  it("shifts every recto by the gutter and opens every chapter on one", async () => {
    const result = await exportPdf(longBook, {
      ...DEFAULT_PRINT_OPTIONS,
      trim: "5x8",
      bindingMargins: true,
      runningHeads: true,
      rectoChapterStarts: true,
    });
    const streams = pageStreams(result.buffer);
    // Long enough to earn the second gutter tier, so the shift is 9pt.
    expect(streams.length).toBeGreaterThan(150);
    expect(gutterForPageCount(streams.length)).toBe(9);

    const shifted = streams.map((stream, index) => ({
      page: index + 1,
      shifted: stream.includes("1 0 0 1 9 0 cm"),
    }));
    expect(shifted).toEqual(shifted.map(({ page }) => ({ page, shifted: isRecto(page) })));

    // Glyphs are hex in the stream; 434841 opens the "CHAPTER" label.
    const openings = streams
      .map((stream, index) => (stream.includes("<434841") ? index + 1 : 0))
      .filter(Boolean);
    expect(openings).toHaveLength(20);
    for (const page of openings) expect(isRecto(page)).toBe(true);

    // Getting there took blank versos, and a blank carries nothing but the flip.
    const blanks = streams.filter((stream) => stream.trim().split("\n").length === 1);
    expect(blanks.length).toBeGreaterThan(0);
  });
});
