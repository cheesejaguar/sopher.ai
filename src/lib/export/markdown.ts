import { manuscriptToMarkdown, type AssembledManuscript } from "./assemble";
import { FORMAT_META, filenameStem, type ExportResult } from "./types";

export function exportMarkdown(m: AssembledManuscript): ExportResult {
  const meta = FORMAT_META.md;
  return {
    buffer: new TextEncoder().encode(manuscriptToMarkdown(m)),
    contentType: meta.contentType,
    filename: `${filenameStem(m.title)}.${meta.extension}`,
  };
}
