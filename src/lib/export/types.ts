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
