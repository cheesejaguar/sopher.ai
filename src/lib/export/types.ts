/** Shared contracts for the export pipeline. */

export const EXPORT_FORMATS = ["md", "docx", "epub", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export type ExportResult = {
  buffer: Uint8Array;
  contentType: string;
  filename: string;
};

export type ExportAssetKind = "export_md" | "export_docx" | "export_epub" | "export_pdf";

export const FORMAT_META: Record<
  ExportFormat,
  { extension: string; contentType: string; assetKind: ExportAssetKind; label: string }
> = {
  md: {
    extension: "md",
    contentType: "text/markdown; charset=utf-8",
    assetKind: "export_md",
    label: "Markdown",
  },
  docx: {
    extension: "docx",
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    assetKind: "export_docx",
    label: "Word",
  },
  epub: {
    extension: "epub",
    contentType: "application/epub+zip",
    assetKind: "export_epub",
    label: "EPUB",
  },
  pdf: {
    extension: "pdf",
    contentType: "application/pdf",
    assetKind: "export_pdf",
    label: "PDF",
  },
};

// ---------------------------------------------------------------------------
// Print layout contract.
//
// The presets and the option shape live here rather than in `print-layout.ts`
// so the export dialog can render them without pulling zod into the client
// bundle. `print-layout.ts` owns validation and all of the geometry.
// ---------------------------------------------------------------------------

export const TRIM_SIZE_IDS = ["5x8", "5.5x8.5", "6x9", "8.5x11"] as const;
export type TrimSizeId = (typeof TRIM_SIZE_IDS)[number];

export type TrimSize = {
  id: TrimSizeId;
  label: string;
  /** [width, height] in PDF points, 72 to the inch. */
  size: readonly [number, number];
  /** One line of guidance for the export dialog. */
  blurb: string;
};

/** 6×9 is the default because it reproduces the geometry PDFs already ship. */
export const DEFAULT_TRIM_SIZE: TrimSizeId = "6x9";

export const TRIM_SIZES: Record<TrimSizeId, TrimSize> = {
  "5x8": {
    id: "5x8",
    label: '5" × 8"',
    size: [360, 576],
    blurb: "Compact trade paperback",
  },
  "5.5x8.5": {
    id: "5.5x8.5",
    label: '5.5" × 8.5"',
    size: [396, 612],
    blurb: "Digest size, common for genre fiction",
  },
  "6x9": {
    id: "6x9",
    label: '6" × 9"',
    size: [432, 648],
    blurb: "Standard trade paperback",
  },
  "8.5x11": {
    id: "8.5x11",
    label: '8.5" × 11"',
    size: [612, 792],
    blurb: "Letter-size proof for marking up",
  },
};

export type PrintOptions = {
  trim: TrimSizeId;
  /** Mirror inside/outside margins and add the page-count binding gutter. */
  bindingMargins: boolean;
  /** Running heads plus outside folios, suppressed on openings and front matter. */
  runningHeads: boolean;
  /** Open every chapter on a recto, inserting a blank verso when needed. */
  rectoChapterStarts: boolean;
};

/** Exactly the geometry PDFs had before print options existed. */
export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  trim: DEFAULT_TRIM_SIZE,
  bindingMargins: false,
  runningHeads: false,
  rectoChapterStarts: false,
};

/** Filesystem-safe filename stem derived from the book title. */
export function filenameStem(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "manuscript";
}
