import { afterEach, describe, expect, it, vi } from "vitest";

import {
  diagramSourceHash,
  hydrateFigureBytes,
  referencedFigureKeys,
  type FigureMap,
} from "./figures";

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 40,
  0, 0, 0, 20,
]);

const usedSource = "graph TD\n  A --> B";
const unusedSource = "graph TD\n  X --> Y";

function figureMap(count = 0): FigureMap {
  const figures: FigureMap = {
    [diagramSourceHash(usedSource)]: {
      svgUrl: null,
      pngUrl: "https://store.public.blob.vercel-storage.com/used.png",
      alt: "Used",
    },
    [diagramSourceHash(unusedSource)]: {
      svgUrl: null,
      pngUrl: "https://store.public.blob.vercel-storage.com/unused.png",
      alt: "Unused",
    },
  };
  for (let index = 0; index < count; index += 1) {
    figures[`hash-${index}`] = {
      svgUrl: null,
      pngUrl: `https://store.public.blob.vercel-storage.com/${index}.png`,
      alt: "",
    };
  }
  return figures;
}

const chapter = `The map was wrong.\n\n\`\`\`mermaid\n${usedSource}  \n\`\`\`\n\nShe redrew it.`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("referencedFigureKeys", () => {
  it("finds the diagrams a manuscript actually contains", () => {
    const keys = referencedFigureKeys(figureMap(), [chapter]);
    expect(keys.has(diagramSourceHash(usedSource))).toBe(true);
    expect(keys.has(diagramSourceHash(unusedSource))).toBe(false);
  });

  it("keeps an image keyed by URL when the text links it", () => {
    const figures = {
      "https://store.public.blob.vercel-storage.com/photo.png": {
        svgUrl: null,
        pngUrl: "x",
        alt: "Photo",
      },
    };
    expect(
      referencedFigureKeys(figures, [
        "![Photo](https://store.public.blob.vercel-storage.com/photo.png)",
      ]).size,
    ).toBe(1);
  });
});

describe("hydrateFigureBytes", () => {
  it("downloads only the figures the exported manuscript references", async () => {
    const fetch = vi.fn(async () => new Response(PNG));
    vi.stubGlobal("fetch", fetch);

    const hydrated = await hydrateFigureBytes(figureMap(), [chapter]);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      "https://store.public.blob.vercel-storage.com/used.png",
      expect.anything(),
    );
    expect(hydrated[diagramSourceHash(usedSource)]).toMatchObject({ width: 40, height: 20 });
    expect(hydrated[diagramSourceHash(unusedSource)].pngBytes).toBeUndefined();
  });

  it("never has more than four downloads in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight -= 1;
        return new Response(PNG);
      }),
    );

    const hydrated = await hydrateFigureBytes(figureMap(12));

    expect(peak).toBeLessThanOrEqual(4);
    expect(Object.values(hydrated).every((figure) => figure.pngBytes)).toBe(true);
  });

  it("gives every download a timeout and degrades a failed one to source text", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      throw new DOMException("The operation timed out.", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetch);

    const hydrated = await hydrateFigureBytes(figureMap(), [chapter]);

    expect(hydrated[diagramSourceHash(usedSource)].pngBytes).toBeUndefined();
  });
});
