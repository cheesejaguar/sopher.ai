import type { AssembledManuscript } from "./assemble";
import { exportDocx } from "./docx";
import { hydrateFigureBytes } from "./figures";
import { exportEpub } from "./epub";
import { exportMarkdown } from "./markdown";
import { exportPdf } from "./pdf";
import type { ExportFormat, ExportResult, PrintOptions } from "./types";

export { loadManuscript, buildManuscript, manuscriptToMarkdown, markdownToHtml } from "./assemble";
export type { AssembledManuscript } from "./assemble";
export { EXPORT_FORMATS, FORMAT_META, filenameStem } from "./types";
export type { ExportFormat, ExportResult, PrintOptions } from "./types";

/**
 * Renders an assembled manuscript into the requested format's bytes.
 *
 * `print` only reaches the PDF renderer; every other format ignores it. It is
 * optional and `exportPdf` defaults it, so a caller that passes nothing gets
 * byte-identical output to before print options existed.
 */
export async function renderExport(
  format: ExportFormat,
  manuscript: AssembledManuscript,
  print?: PrintOptions,
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
      return exportPdf(
        { ...manuscript, figures: await hydrateFigureBytes(manuscript.figures) },
        print,
      );
  }
}
