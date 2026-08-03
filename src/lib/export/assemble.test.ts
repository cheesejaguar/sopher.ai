import { describe, expect, it } from "vitest";

import {
  buildManuscript,
  chapterHeading,
  manuscriptToMarkdown,
  markdownToBlocks,
  markdownToHtml,
  parseInline,
  stripInline,
  MANUSCRIPT_AUTHOR,
  selectManuscriptOwnerRun,
} from "./assemble";
import { diagramSourceHash, fitWidth, pngDimensions } from "./figures";
import { filenameStem } from "./types";

const source = {
  title: "The Salt Road",
  synopsis: "A ferryman's daughter smuggles hope across a drowned coast.",
  genre: "Literary fiction",
  chapters: [
    { number: 2, title: "Storm Glass", content: "Second chapter prose.\n\nWith two paragraphs." },
    { number: 1, title: null, content: "  First chapter prose. Five words here.  " },
    { number: 3, title: "Empty", content: "   " },
  ],
};

describe("buildManuscript", () => {
  const m = buildManuscript(source);

  it("filters empty chapters and orders by number", () => {
    expect(m.chapters.map((c) => c.number)).toEqual([1, 2]);
  });

  it("fills default titles and trims content", () => {
    expect(m.chapters[0].title).toBe("Chapter 1");
    expect(m.chapters[0].markdown).toBe("First chapter prose. Five words here.");
    expect(m.chapters[1].title).toBe("Storm Glass");
  });

  it("computes word counts", () => {
    expect(m.chapters[0].wordCount).toBe(6);
    expect(m.totalWords).toBe(6 + 6);
  });

  it("stamps the sopher.ai byline", () => {
    expect(m.author).toBe(MANUSCRIPT_AUTHOR);
    expect(m.author).toBe("Written with sopher.ai");
  });
});

describe("export manuscript ownership", () => {
  it("ignores a newer zero-work failed rerun with a shorter shape", () => {
    const completedRunId = "11111111-1111-4111-8111-111111111111";
    expect(
      selectManuscriptOwnerRun([
        {
          id: "22222222-2222-4222-8222-222222222222",
          status: "failed",
          config: { targetChapters: 3 },
        },
        {
          id: completedRunId,
          status: "completed",
          config: {
            targetChapters: 10,
            manuscriptPrepared: true,
            completion: {
              finalized: {
                sourceRunId: completedRunId,
                manuscriptDigest: "complete-ten-chapter-digest",
              },
            },
          },
        },
      ]),
    ).toMatchObject({
      id: completedRunId,
      status: "completed",
      config: { targetChapters: 10 },
    });
  });

  it("uses a newer run once its manuscript preparation checkpoint committed", () => {
    expect(
      selectManuscriptOwnerRun([
        {
          id: "new-prepared-run",
          status: "failed",
          config: { targetChapters: 3, manuscriptPrepared: true },
        },
        {
          id: "old-completed-run",
          status: "completed",
          config: {
            targetChapters: 10,
            completion: {
              finalized: {
                sourceRunId: "old-completed-run",
                manuscriptDigest: "old-digest",
              },
            },
          },
        },
      ]),
    ).toMatchObject({ id: "new-prepared-run" });
  });

  it("keeps a completed pinned-v1 manuscript exportable without a v2 digest", () => {
    expect(
      selectManuscriptOwnerRun([
        {
          id: "legacy-completed-run",
          status: "completed",
          config: { protocolVersion: 1, targetChapters: 8 },
        },
      ]),
    ).toMatchObject({
      id: "legacy-completed-run",
      config: { targetChapters: 8 },
    });
    expect(
      selectManuscriptOwnerRun([
        {
          id: "v2-contradiction",
          status: "completed",
          config: { protocolVersion: 2, targetChapters: 8 },
        },
      ]),
    ).toBeUndefined();
  });
});

describe("chapterHeading", () => {
  it("collapses default titles", () => {
    expect(chapterHeading({ number: 1, title: "Chapter 1" })).toBe("Chapter 1");
  });
  it("joins real titles with an em dash", () => {
    expect(chapterHeading({ number: 2, title: "Storm Glass" })).toBe("Chapter 2 — Storm Glass");
  });
});

describe("manuscriptToMarkdown", () => {
  it("assembles the exact deterministic document", () => {
    const md = manuscriptToMarkdown(buildManuscript(source));
    expect(md).toBe(
      [
        "# The Salt Road",
        "",
        "*A ferryman's daughter smuggles hope across a drowned coast.*",
        "",
        "Written with sopher.ai",
        "",
        "_an early reading copy_",
        "",
        "## Contents",
        "",
        "1. Chapter 1",
        "2. Storm Glass",
        "",
        "***",
        "",
        "## Chapter 1",
        "",
        "First chapter prose. Five words here.",
        "",
        "***",
        "",
        "## Chapter 2 — Storm Glass",
        "",
        "Second chapter prose.",
        "",
        "With two paragraphs.",
        "",
      ].join("\n"),
    );
  });

  it("omits the synopsis line when absent", () => {
    const md = manuscriptToMarkdown(
      buildManuscript({
        title: "Untitled",
        chapters: [{ number: 1, title: null, content: "Hi." }],
      }),
    );
    expect(md.startsWith("# Untitled\n\nWritten with sopher.ai\n")).toBe(true);
  });

  it("normalizes historical transport formatting in the raw Markdown export", () => {
    const md = manuscriptToMarkdown(
      buildManuscript({
        title: "Recovered manuscript",
        chapters: [
          {
            number: 1,
            title: "The Storefront",
            content:
              "    Noah did not believe in fate.\n\n    The storefront sat on a corner in Queens.",
          },
          {
            number: 2,
            title: "The Door",
            content: "```markdown\nRain silvered the pavement.\n\nThe door opened.\n```",
          },
        ],
      }),
    );

    expect(md).toContain(
      "## Chapter 1 — The Storefront\n\nNoah did not believe in fate.\n\nThe storefront sat on a corner in Queens.",
    );
    expect(md).toContain(
      "## Chapter 2 — The Door\n\nRain silvered the pavement.\n\nThe door opened.",
    );
    expect(md).not.toContain("    Noah");
    expect(md).not.toContain("```markdown");
  });
});

describe("markdownToBlocks", () => {
  it("parses headings, quotes, scene breaks, and paragraphs", () => {
    const blocks = markdownToBlocks(
      "# Dawn\n\nFirst line\ncontinues here.\n\n> A quoted\n> letter.\n\n---\n\nAfter the break.",
    );
    expect(blocks).toEqual([
      { kind: "heading", depth: 1, text: "Dawn" },
      { kind: "paragraph", text: "First line continues here." },
      { kind: "quote", text: "A quoted letter." },
      { kind: "scene-break" },
      { kind: "paragraph", text: "After the break." },
    ]);
  });

  it("clamps heading depth to 3", () => {
    expect(markdownToBlocks("##### Deep")).toEqual([{ kind: "heading", depth: 3, text: "Deep" }]);
  });
});

describe("inline parsing", () => {
  it("splits bold and italic runs", () => {
    expect(parseInline("A **bold** and *quiet* _word_")).toEqual([
      { text: "A " },
      { text: "bold", bold: true },
      { text: " and " },
      { text: "quiet", italic: true },
      { text: " " },
      { text: "word", italic: true },
    ]);
  });

  it("strips markers for plain sinks", () => {
    expect(stripInline("A **bold** and *quiet* word")).toBe("A bold and quiet word");
  });
});

describe("markdownToHtml", () => {
  it("renders emphasis and escapes raw HTML", () => {
    const html = markdownToHtml("Hello <script>alert(1)</script> *world*");
    expect(html).toContain("<em>world</em>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("recovers uniformly indented manuscript prose instead of rendering a code block", () => {
    const html = markdownToHtml(
      "    Noah did not believe in fate.\n\n    The storefront sat on a corner in Queens.",
    );

    expect(html).toContain("<p>Noah did not believe in fate.</p>");
    expect(html).toContain("<p>The storefront sat on a corner in Queens.</p>");
    expect(html).not.toContain("<pre>");
  });

  it("unwraps a model-supplied Markdown fence while preserving nested fenced code", () => {
    const html = markdownToHtml("```markdown\nA paragraph.\n\n```ts\nconst chapter = 1;\n```\n```");

    expect(html).toContain("<p>A paragraph.</p>");
    expect(html).toContain('<code class="language-ts">');
  });
});

describe("filenameStem", () => {
  it("slugs titles and falls back for empty ones", () => {
    expect(filenameStem("The Salt Road!")).toBe("the-salt-road");
    expect(filenameStem("   ")).toBe("manuscript");
  });
});

// ---------------------------------------------------------------------------
// Figures: mermaid diagrams and inline images.
// ---------------------------------------------------------------------------

const DIAGRAM = "flowchart TD\n  A[Start] --> B[End]";
const DIAGRAM_MD = "```mermaid\n" + DIAGRAM + "\n```";
const diagramFigures = {
  [diagramSourceHash(DIAGRAM)]: {
    svgUrl: "https://blob.example/d.svg",
    pngUrl: "https://blob.example/d.png",
    alt: "Diagram: Start, End",
  },
};

describe("diagramSourceHash", () => {
  it("ignores trailing whitespace so editor and stored markdown agree", () => {
    expect(diagramSourceHash("flowchart TD\n  A --> B  \n")).toBe(
      diagramSourceHash("flowchart TD\n  A --> B"),
    );
  });

  it("distinguishes different diagrams", () => {
    expect(diagramSourceHash("flowchart TD\n A-->B")).not.toBe(
      diagramSourceHash("flowchart TD\n A-->C"),
    );
  });
});

describe("markdownToHtml figures", () => {
  it("renders a cached mermaid fence as an image, not source", () => {
    const html = markdownToHtml(DIAGRAM_MD, diagramFigures);
    expect(html).toContain('<img src="https://blob.example/d.svg"');
    expect(html).toContain('alt="Diagram: Start, End"');
    expect(html).not.toContain("flowchart TD");
  });

  it("prefers the PNG when asked (EPUB readers handle SVG poorly)", () => {
    expect(markdownToHtml(DIAGRAM_MD, diagramFigures, "png")).toContain(
      'src="https://blob.example/d.png"',
    );
  });

  it("falls back to the source block when the diagram is not cached", () => {
    const html = markdownToHtml(DIAGRAM_MD, {});
    expect(html).toContain("flowchart TD");
    expect(html).not.toContain("<img");
  });

  it("leaves non-mermaid code blocks alone", () => {
    const html = markdownToHtml("```ts\nconst a = 1;\n```", diagramFigures);
    expect(html).toContain("const a = 1;");
  });
});

describe("markdownToBlocks figures", () => {
  it("emits a figure block for a cached diagram", () => {
    const blocks = markdownToBlocks(DIAGRAM_MD, diagramFigures);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "figure", figure: { alt: "Diagram: Start, End" } });
  });

  it("degrades an uncached diagram to a code block rather than dropping it", () => {
    const blocks = markdownToBlocks(DIAGRAM_MD, {});
    expect(blocks[0]).toMatchObject({ kind: "code", language: "mermaid", text: DIAGRAM });
  });

  it("treats a standalone image line as a figure", () => {
    const blocks = markdownToBlocks("![A harbour at dusk](https://blob.example/i.png)");
    expect(blocks[0]).toMatchObject({
      kind: "figure",
      figure: { pngUrl: "https://blob.example/i.png", alt: "A harbour at dusk" },
    });
  });

  it("keeps prose around a diagram intact", () => {
    const blocks = markdownToBlocks(`Before.\n\n${DIAGRAM_MD}\n\nAfter.`, diagramFigures);
    expect(blocks.map((b) => b.kind)).toEqual(["paragraph", "figure", "paragraph"]);
  });
});

describe("pngDimensions", () => {
  it("reads width and height from the IHDR chunk", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    new DataView(png.buffer).setUint32(16, 640);
    new DataView(png.buffer).setUint32(20, 480);
    expect(pngDimensions(png)).toEqual({ width: 640, height: 480 });
  });

  it("returns null for non-PNG bytes", () => {
    expect(pngDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("fitWidth", () => {
  it("leaves images narrower than the limit untouched", () => {
    expect(fitWidth({ width: 300, height: 200 }, 576)).toEqual({ width: 300, height: 200 });
  });

  it("scales down preserving aspect ratio", () => {
    expect(fitWidth({ width: 1200, height: 600 }, 600)).toEqual({ width: 600, height: 300 });
  });
});
