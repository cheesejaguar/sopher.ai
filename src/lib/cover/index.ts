import { createElement } from "react";

import {
  composeCoverTypeLayer,
  resolveCoverCanvas,
  type CoverLayoutId,
  type CoverPaletteId,
  type CoverTypePlan,
} from "./compose";

export * from "./compose";

/**
 * Burns the type layer onto the generated art.
 *
 * `sharp` is not reachable from application code in this repo — it exists only
 * inside `next`'s own dependency tree — so rasterisation goes through
 * `next/og`, which ships the same resvg/satori pair Next uses for OG images.
 * The output stays a PNG, which is what the EPUB, PDF and reader paths already
 * know how to consume.
 */

/**
 * Where the untouched painting lives.
 *
 * The `cover` kind stays what it has always been — the finished image that
 * exports, editions and the reader consume — so nothing downstream changes.
 * The art behind it is a separate row, and deliberately not a `cover` row:
 * reader-share cleanup collects every `cover` asset the book no longer points
 * at, which would destroy the one thing re-lettering depends on.
 */
export const COVER_ART_ASSET_KIND = "illustration" as const;
export const COVER_ART_ROLE = "cover-art";

export class CoverCompositionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CoverCompositionError";
  }
}

export type TitledCover = {
  bytes: Uint8Array;
  contentType: "image/png";
  width: number;
  height: number;
  plan: CoverTypePlan;
};

export type TitledCoverRequest = {
  art: Uint8Array;
  artContentType: string;
  title: string;
  subtitle?: string | null;
  author?: string | null;
  layout?: CoverLayoutId;
  palette?: CoverPaletteId;
};

function dataUri(bytes: Uint8Array, contentType: string): string {
  return `data:${contentType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function renderTitledCover(request: TitledCoverRequest): Promise<TitledCover> {
  if (request.art.byteLength === 0) throw new CoverCompositionError("The cover art is empty");

  const { width, height } = resolveCoverCanvas(request.art);
  const { svg, plan } = composeCoverTypeLayer({ ...request, width, height });

  let bytes: Uint8Array;
  try {
    const { ImageResponse } = await import("next/og");
    const frame = createElement(
      "div",
      { style: { position: "relative", display: "flex", width: "100%", height: "100%" } },
      createElement("img", {
        // Inlined rather than fetched: the caller already holds these bytes,
        // and a render must never depend on a second network round trip.
        src: dataUri(request.art, request.artContentType || "image/png"),
        width,
        height,
        style: { position: "absolute", top: 0, left: 0, width, height, objectFit: "cover" },
      }),
      createElement("img", {
        src: dataUri(new TextEncoder().encode(svg), "image/svg+xml"),
        width,
        height,
        style: { position: "absolute", top: 0, left: 0, width, height },
      }),
    );
    const response = new ImageResponse(frame, { width, height });
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (error) {
    throw new CoverCompositionError("Could not rasterise the cover lettering", { cause: error });
  }
  if (bytes.byteLength === 0) {
    throw new CoverCompositionError("The cover rasteriser produced no image");
  }

  return { bytes, contentType: "image/png", width, height, plan };
}
