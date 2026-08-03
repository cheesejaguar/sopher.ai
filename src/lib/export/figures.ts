import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";

/**
 * Figure resolution for diagrams and inline images.
 *
 * Mermaid needs a DOM, so we never render it on the server. The editor renders
 * each diagram client-side and uploads the SVG + a PNG rasterization, keyed by
 * a hash of the source. Every server-side surface (reading view, EPUB, PDF,
 * DOCX) then looks the render up by that hash. A miss is not an error — callers
 * fall back to showing the source, so a diagram never silently disappears.
 */

export type FigureAsset = {
  svgUrl: string | null;
  pngUrl: string | null;
  alt: string;
  /** Only populated for the byte-embedding exporters (PDF, DOCX). */
  pngBytes?: Uint8Array;
  width?: number;
  height?: number;
};

/** Keyed by diagram source hash, or by URL for plain markdown images. */
export type FigureMap = Record<string, FigureAsset>;

export type FigureRow = {
  blobUrl: string;
  contentType: string;
  meta: unknown;
};

/**
 * Hash of a diagram's source. The client computes the same digest over the same
 * normalized string via SubtleCrypto — keep the two in step or every lookup
 * misses and exports quietly regress to source text.
 */
export function diagramSourceHash(source: string): string {
  return createHash("sha256").update(normalizeDiagramSource(source), "utf8").digest("hex");
}

/** Trailing whitespace differs between the editor and stored markdown; ignore it. */
export function normalizeDiagramSource(source: string): string {
  return source
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/** Width/height from a PNG's IHDR chunk. Null when the bytes are not a PNG. */
export function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  // 8-byte signature, then a 4-byte length + "IHDR" + width/height as big-endian u32.
  if (bytes.length < 24) return null;
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (signature.some((byte, i) => bytes[i] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Scales an image down to fit a max width, preserving aspect ratio. */
export function fitWidth(
  dims: { width: number; height: number },
  maxWidth: number,
): { width: number; height: number } {
  if (dims.width <= maxWidth) return dims;
  const scale = maxWidth / dims.width;
  return { width: Math.round(dims.width * scale), height: Math.round(dims.height * scale) };
}

/** Turns one consistent asset query into the map shared by reading and export. */
export function buildFigureMap(rows: FigureRow[]): FigureMap {
  const figures: FigureMap = {};
  for (const row of rows) {
    const meta = (row.meta ?? {}) as { sourceHash?: string; alt?: string };
    if (!meta.sourceHash) continue;
    const existing = figures[meta.sourceHash] ?? {
      svgUrl: null,
      pngUrl: null,
      alt: meta.alt || "Diagram",
    };
    if (row.contentType === "image/svg+xml") existing.svgUrl = row.blobUrl;
    if (row.contentType === "image/png") existing.pngUrl = row.blobUrl;
    if (meta.alt) existing.alt = meta.alt;
    figures[meta.sourceHash] = existing;
  }
  return figures;
}

/** Every diagram render stored for a project, keyed by source hash. */
export async function loadFigures(projectId: string): Promise<FigureMap> {
  const rows = await getDb()
    .select({
      blobUrl: schema.assets.blobUrl,
      contentType: schema.assets.contentType,
      meta: schema.assets.meta,
    })
    .from(schema.assets)
    .where(and(eq(schema.assets.projectId, projectId), eq(schema.assets.kind, "diagram")));
  return buildFigureMap(rows);
}

/**
 * Downloads PNG bytes for the figures PDF/DOCX will embed. Failures are
 * swallowed per-figure: a fetch error degrades that one diagram to source text
 * rather than failing the whole export.
 */
export async function hydrateFigureBytes(figures: FigureMap): Promise<FigureMap> {
  const entries = Object.entries(figures).filter(([, figure]) => figure.pngUrl);
  const hydrated: FigureMap = { ...figures };

  await Promise.all(
    entries.map(async ([key, figure]) => {
      try {
        const response = await fetch(figure.pngUrl as string);
        if (!response.ok) return;
        const bytes = new Uint8Array(await response.arrayBuffer());
        const dims = pngDimensions(bytes);
        hydrated[key] = { ...figure, pngBytes: bytes, ...(dims ?? {}) };
      } catch {
        // Leave the figure without bytes; exporters fall back to source text.
      }
    }),
  );

  return hydrated;
}
