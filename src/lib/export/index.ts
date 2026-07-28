import type { AssembledManuscript } from "./assemble";
import { exportDocx } from "./docx";
import { hydrateFigureBytes } from "./figures";
import { exportEpub } from "./epub";
import { exportMarkdown } from "./markdown";
import { exportPdf } from "./pdf";
import type { ExportFormat, ExportResult } from "./types";

export { loadManuscript, buildManuscript, manuscriptToMarkdown, markdownToHtml } from "./assemble";
export type { AssembledManuscript } from "./assemble";
export { EXPORT_FORMATS, FORMAT_META, filenameStem } from "./types";
export type { ExportFormat, ExportResult } from "./types";

/** Renders an assembled manuscript into the requested format's bytes. */
export async function renderExport(
  format: ExportFormat,
  manuscript: AssembledManuscript,
): Promise<ExportResult> {
  switch (format) {
    case "md":
      return exportMarkdown(manuscript);
    // PDF and DOCX embed image bytes directly, so figures must be downloaded
    // first. EPUB fetches referenced images itself; markdown keeps the source.
    case "docx":
      return exportDocx({ ...manuscript, figures: await hydrateFigureBytes(manuscript.figures) });
    case "epub":
      return exportEpub(manuscript);
    case "pdf":
      return exportPdf({ ...manuscript, figures: await hydrateFigureBytes(manuscript.figures) });
  }
}
