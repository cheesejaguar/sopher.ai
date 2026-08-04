import { z } from "zod";

import {
  DEFAULT_PRINT_OPTIONS,
  DEFAULT_TRIM_SIZE,
  TRIM_SIZE_IDS,
  TRIM_SIZES,
  type PrintOptions,
  type TrimSize,
  type TrimSizeId,
} from "./types";

/**
 * Where everything sits on a printed page. Pure: no pdfkit, no I/O, no clock —
 * the renderer asks this module for coordinates and only draws.
 *
 * Print vocabulary, because the whole module turns on it: a page's *inside*
 * margin is the one against the spine and its *outside* margin the one at the
 * fore-edge, so which physical side each lands on flips with the page's parity.
 * Page 1 of the block is a recto (right-hand, odd-numbered); its verso is the
 * back of the same leaf. Page numbers here are 1-based physical sheets, not the
 * printed folio, which starts later and is a separate number.
 */

export { DEFAULT_PRINT_OPTIONS, DEFAULT_TRIM_SIZE, TRIM_SIZE_IDS, TRIM_SIZES };
export type { PrintOptions, TrimSize, TrimSizeId };

export const POINTS_PER_INCH = 72;

/** 0.75in on every side — the uniform margin PDFs shipped with. */
const BASE_MARGIN = 54;

/** The 6×9 page height every hard-coded vertical position was tuned against. */
const REFERENCE_HEIGHT = TRIM_SIZES[DEFAULT_TRIM_SIZE].size[1];

/** Running head baseline, measured up from the top of the text block. */
const RUNNING_HEAD_RISE = 24;

/** Folio baseline, measured down from the bottom of the text block. */
const FOLIO_DROP = 18;

/**
 * KDP's minimum inside margin by interior page count. The base margin already
 * clears the shortest tier, so the binding gutter is the amount by which a
 * longer book exceeds it: a 400-page novel ends up with a 1in inside margin,
 * which is what a bound spine actually swallows.
 */
const KDP_INSIDE_MARGIN_TIERS: ReadonlyArray<{ maxPages: number; inside: number }> = [
  { maxPages: 150, inside: 27 },
  { maxPages: 300, inside: 36 },
  { maxPages: 500, inside: 45 },
  { maxPages: 700, inside: 54 },
  { maxPages: Number.POSITIVE_INFINITY, inside: 63 },
];

const SHORTEST_TIER_INSIDE = KDP_INSIDE_MARGIN_TIERS[0].inside;

function interiorPageCount(pageCount: number | undefined): number {
  if (typeof pageCount !== "number" || !Number.isFinite(pageCount)) return 1;
  return Math.max(1, Math.floor(pageCount));
}

/** The inside margin KDP requires at this page count, in points. */
export function kdpMinimumInsideMargin(pageCount: number): number {
  const pages = interiorPageCount(pageCount);
  const tier = KDP_INSIDE_MARGIN_TIERS.find((candidate) => pages <= candidate.maxPages);
  return tier ? tier.inside : SHORTEST_TIER_INSIDE;
}

/** How much wider than the outside margin the binding edge must run. */
export function gutterForPageCount(pageCount: number): number {
  return kdpMinimumInsideMargin(pageCount) - SHORTEST_TIER_INSIDE;
}

export const printOptionsSchema = z.object({
  trim: z.enum(TRIM_SIZE_IDS).default(DEFAULT_TRIM_SIZE),
  bindingMargins: z.boolean().default(DEFAULT_PRINT_OPTIONS.bindingMargins),
  runningHeads: z.boolean().default(DEFAULT_PRINT_OPTIONS.runningHeads),
  rectoChapterStarts: z.boolean().default(DEFAULT_PRINT_OPTIONS.rectoChapterStarts),
});

/**
 * Never throws. A run queued before print options existed, or one whose stored
 * options no longer parse, renders the geometry it would have rendered anyway
 * rather than failing an export whose work is already paid for.
 */
export function parsePrintOptions(value: unknown): PrintOptions {
  const parsed = printOptionsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : DEFAULT_PRINT_OPTIONS;
}

export type PageMargins = { top: number; bottom: number; left: number; right: number };

export type PrintLayout = {
  options: PrintOptions;
  trim: TrimSize;
  /** [width, height] in points, ready to hand to pdfkit. */
  size: [number, number];
  /** The margins every page is flowed with; parity is an origin shift instead. */
  margins: PageMargins;
  inside: number;
  outside: number;
  gutter: number;
  /** Text measure. Identical on recto and verso, which is the point. */
  bodyWidth: number;
  runningHeadY: number;
  folioY: number;
  /** Scales the 6×9-tuned vertical positions to another trim; exactly 1 at 6×9. */
  verticalScale: number;
};

/**
 * `pageCount` picks the gutter tier and is unknown until the book is laid out,
 * so callers render once without it and re-resolve with the count they got.
 */
export function resolvePrintLayout(options: PrintOptions, pageCount?: number): PrintLayout {
  const trim = TRIM_SIZES[options.trim];
  const [width, height] = trim.size;
  const gutter = options.bindingMargins ? gutterForPageCount(interiorPageCount(pageCount)) : 0;
  const outside = BASE_MARGIN;
  const inside = BASE_MARGIN + gutter;
  // pdfkit flows a document with one set of margins, so it gets the verso
  // arrangement and recto pages move their drawing origin right by the gutter.
  const margins: PageMargins = {
    top: BASE_MARGIN,
    bottom: BASE_MARGIN,
    left: outside,
    right: inside,
  };
  return {
    options,
    trim,
    size: [width, height],
    margins,
    inside,
    outside,
    gutter,
    bodyWidth: width - inside - outside,
    runningHeadY: margins.top - RUNNING_HEAD_RISE,
    folioY: height - margins.bottom + FOLIO_DROP,
    verticalScale: height / REFERENCE_HEIGHT,
  };
}

/** Page 1 of the block is a right-hand page, and parity alternates from there. */
export function isRecto(pageNumber: number): boolean {
  return Math.abs(pageNumber % 2) === 1;
}

/** True when a chapter opening on this page would land on a left-hand page. */
export function needsBlankVerso(pageNumber: number): boolean {
  return !isRecto(pageNumber);
}

/**
 * How far right this page's drawing origin moves so its binding edge is the
 * inside margin. Shifting the origin rather than the margins keeps the measure —
 * and therefore where every line and page breaks — identical on both parities,
 * which matters because pdfkit carries a paragraph's starting x across a
 * mid-paragraph page break.
 */
export function pageOriginShift(layout: PrintLayout, pageNumber: number): number {
  return isRecto(pageNumber) ? layout.gutter : 0;
}

/** The margins a preflight check would measure on this physical page. */
export function marginsForPage(layout: PrintLayout, pageNumber: number): PageMargins {
  const { top, bottom } = layout.margins;
  return isRecto(pageNumber)
    ? { top, bottom, left: layout.inside, right: layout.outside }
    : { top, bottom, left: layout.outside, right: layout.inside };
}

export type PageRole =
  | "cover"
  /** Anything before chapter one: title, copyright, dedication, epigraph, prefatory matter. */
  | "front"
  /** The first page of a chapter or of a back-matter section. */
  | "opening"
  /** A verso inserted only so the next chapter opens on a recto. */
  | "blank"
  | "body";

export type PageText = {
  text: string;
  /** In the page's own drawing space, which a recto has already shifted. */
  x: number;
  width: number;
  align: "left" | "center" | "right";
};

export type PageFurniture = { head: PageText | null; folio: PageText | null };

const NO_FURNITURE: PageFurniture = { head: null, folio: null };

/**
 * The running head and folio for one page, or nothing where the page carries
 * neither. `folio` is the printed number the renderer assigned, and a null
 * folio is how it says this page sits before chapter one.
 */
export function pageFurniture(
  layout: PrintLayout,
  page: {
    pageNumber: number;
    role: PageRole;
    folio: number | null;
    title: string;
    author: string;
  },
): PageFurniture {
  if (page.folio === null) return NO_FURNITURE;
  if (page.role === "cover" || page.role === "front" || page.role === "blank") {
    return NO_FURNITURE;
  }

  const shift = pageOriginShift(layout, page.pageNumber);
  const recto = isRecto(page.pageNumber);

  if (!layout.options.runningHeads) {
    // The treatment PDFs have always had: one folio centred on the trim, no
    // heads, chapter openings numbered like any other page. Undoing the origin
    // shift keeps it centred on the paper rather than on the text block.
    return {
      head: null,
      folio: {
        text: String(page.folio),
        x: 0 - shift,
        width: layout.size[0],
        align: "center",
      },
    };
  }

  // A chapter opening announces itself; a head and folio there is noise.
  if (page.role === "opening") return NO_FURNITURE;

  return {
    head: {
      text: recto ? page.title : page.author,
      x: layout.outside,
      width: layout.bodyWidth,
      align: "center",
    },
    folio: {
      text: String(page.folio),
      x: layout.outside,
      width: layout.bodyWidth,
      align: recto ? "right" : "left",
    },
  };
}
