import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import mammoth from "mammoth";
import { describe, expect, it } from "vitest";

import { splitManuscript } from "./split";
import {
  decodeImportedText,
  detectImportFormat,
  htmlToMarkdown,
  normalizeImportedMarkdown,
  plainTextToMarkdown,
  textToMarkdown,
} from "./parse";

describe("normalizeImportedMarkdown", () => {
  it("normalizes line endings, invisibles and blank runs", () => {
    const source = "﻿One\r\n\r\n\r\n\r\nTwo​three four   \nFive";
    expect(normalizeImportedMarkdown(source)).toBe("One\n\nTwothree four\nFive");
  });

  it("keeps form feeds, which are a chapter boundary", () => {
    expect(normalizeImportedMarkdown("One\n\f\nTwo")).toBe("One\n\f\nTwo");
  });

  it("trims the document without touching its interior", () => {
    expect(normalizeImportedMarkdown("\n\n  \nOne\n\nTwo\n \n\n")).toBe("One\n\nTwo");
  });
});

describe("plainTextToMarkdown", () => {
  it("strips the leading indentation that would otherwise become a code block", () => {
    const source = ["    Once the harbour froze.", "", "    Then it did not."].join("\n");
    expect(plainTextToMarkdown(source)).toBe("Once the harbour froze.\n\nThen it did not.");
  });

  it("treats an indent as the paragraph mark when the file has no blank lines", () => {
    const source = [
      "  The first paragraph starts here",
      "and wraps onto this line.",
      "  The second paragraph starts here",
      "and wraps too.",
      "  The third one is short.",
    ].join("\n");
    expect(plainTextToMarkdown(source)).toBe(
      [
        "The first paragraph starts here and wraps onto this line.",
        "",
        "The second paragraph starts here and wraps too.",
        "",
        "The third one is short.",
      ].join("\n"),
    );
  });

  it("treats each line as a paragraph when there is nothing else to go on", () => {
    expect(plainTextToMarkdown("One line.\nAnother line.")).toBe("One line.\n\nAnother line.");
  });
});

describe("htmlToMarkdown", () => {
  it("converts the block structure Word produces", () => {
    const markdown = htmlToMarkdown(
      "<h1>The Salt Road</h1><h2>Chapter 1</h2><p>The tide came in.</p><p>It went out again.</p>",
    );
    expect(markdown).toBe(
      "# The Salt Road\n\n## Chapter 1\n\nThe tide came in.\n\nIt went out again.",
    );
  });

  it("keeps emphasis markers against the words they mark", () => {
    expect(htmlToMarkdown("<p>She said <strong> stop </strong>and <em>meant</em> it.</p>")).toBe(
      "She said **stop** and *meant* it.",
    );
  });

  it("drops script and style content entirely", () => {
    const markdown = htmlToMarkdown(
      "<p>Before</p><script>alert(1)</script><style>p{}</style><p onclick='x()'>After</p>",
    );
    expect(markdown).toBe("Before\n\nAfter");
    expect(markdown).not.toContain("alert");
  });

  it("keeps fetchable links and images but not the other schemes", () => {
    expect(htmlToMarkdown('<p><a href="https://example.com">here</a></p>')).toBe(
      "[here](https://example.com)",
    );
    expect(htmlToMarkdown('<p><a href="javascript:alert(1)">here</a></p>')).toBe("here");
    expect(htmlToMarkdown('<p><img src="https://example.com/a.png" alt="Map"></p>')).toBe(
      "![Map](https://example.com/a.png)",
    );
    // Word embeds its pictures in the file, and mammoth returns them base64.
    expect(htmlToMarkdown('<p><img src="data:image/png;base64,AAAA" alt="Map"></p>')).toBe("");
  });

  it("converts lists, quotes, rules and tables", () => {
    expect(htmlToMarkdown("<ul><li>One</li><li>Two</li></ul>")).toBe("- One\n- Two");
    expect(htmlToMarkdown("<ol><li>One</li><li>Two</li></ol>")).toBe("1. One\n2. Two");
    expect(htmlToMarkdown("<blockquote><p>Held fast.</p></blockquote>")).toBe("> Held fast.");
    expect(htmlToMarkdown("<p>A</p><hr /><p>B</p>")).toBe("A\n\n***\n\nB");
    expect(
      htmlToMarkdown(
        "<table><tr><th>Year</th><th>Tide</th></tr><tr><td>1974</td><td>High</td></tr></table>",
      ),
    ).toBe("| Year | Tide |\n| --- | --- |\n| 1974 | High |");
  });

  it("escapes prose that would otherwise read as a different block", () => {
    expect(htmlToMarkdown("<p>#1 on the list</p>")).toBe("#1 on the list");
    expect(htmlToMarkdown("<p># A hash opens this line</p>")).toBe("\\# A hash opens this line");
    expect(htmlToMarkdown("<p>- a dash opens this line</p>")).toBe("\\- a dash opens this line");
  });

  it("returns nothing for markup with no text in it", () => {
    expect(htmlToMarkdown("<div><span></span></div>")).toBe("");
  });
});

describe("decodeImportedText", () => {
  function bytes(...values: number[]): ArrayBuffer {
    return new Uint8Array(values).buffer;
  }

  it("reads UTF-8 and drops its byte-order mark", () => {
    expect(decodeImportedText(new TextEncoder().encode("Chapter One").buffer)).toBe("Chapter One");
    expect(decodeImportedText(bytes(0xef, 0xbb, 0xbf, 0x41))).toBe("A");
  });

  it("reads the UTF-16 files Word still writes", () => {
    // "Hi" little-endian and big-endian, each behind its own BOM.
    expect(decodeImportedText(bytes(0xff, 0xfe, 0x48, 0x00, 0x69, 0x00))).toBe("Hi");
    expect(decodeImportedText(bytes(0xfe, 0xff, 0x00, 0x48, 0x00, 0x69))).toBe("Hi");
  });

  it("refuses a file that is still binary after decoding", () => {
    expect(decodeImportedText(bytes(0x25, 0x50, 0x44, 0x46, 0x00, 0x01))).toBeNull();
  });
});

describe("detectImportFormat", () => {
  it("trusts the extension over the media type", () => {
    expect(detectImportFormat("draft.docx", "text/plain")).toBe("docx");
    expect(detectImportFormat("DRAFT.MD", "application/octet-stream")).toBe("markdown");
    expect(detectImportFormat("draft.txt", null)).toBe("text");
  });

  it("falls back to the media type when there is no extension", () => {
    expect(detectImportFormat("draft", "text/markdown; charset=utf-8")).toBe("markdown");
    expect(detectImportFormat("draft", "text/plain")).toBe("text");
  });

  it("refuses formats we cannot read", () => {
    expect(detectImportFormat("draft.doc", null)).toBeNull();
    expect(detectImportFormat("draft.pdf", "application/pdf")).toBeNull();
    expect(detectImportFormat("draft.epub", null)).toBeNull();
    expect(detectImportFormat("draft", null)).toBeNull();
  });
});

describe("a real .docx, end to end", () => {
  it("reads Word headings and runs into chapters", async () => {
    const document = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: "The Salt Road", heading: HeadingLevel.HEADING_1 }),
            new Paragraph({ text: "Chapter 1 — Low Water", heading: HeadingLevel.HEADING_2 }),
            new Paragraph({
              children: [
                new TextRun("The tide came in "),
                new TextRun({ text: "slowly", italics: true }),
                new TextRun(", and the harbour held its breath until dawn."),
              ],
            }),
            new Paragraph({ text: "Chapter 2 — Storm Glass", heading: HeadingLevel.HEADING_2 }),
            new Paragraph("It went out again, and took the jetty with it."),
          ],
        },
      ],
    });

    const { value } = await mammoth.convertToHtml({
      buffer: Buffer.from(await Packer.toBuffer(document)),
    });
    const result = splitManuscript(htmlToMarkdown(value));

    expect(result.strategy).toBe("chapter-heading");
    expect(result.title).toBe("The Salt Road");
    expect(result.chapters.map((chapter) => chapter.title)).toEqual(["Low Water", "Storm Glass"]);
    expect(result.chapters[0].markdown).toBe(
      "The tide came in *slowly*, and the harbour held its breath until dawn.",
    );
  });
});

describe("textToMarkdown", () => {
  it("leaves Markdown structure alone and rebuilds it for plain text", () => {
    expect(textToMarkdown("# Chapter 1\n\n    indented line", "markdown")).toBe(
      "# Chapter 1\n\n    indented line",
    );
    expect(textToMarkdown("# Chapter 1\n\n    indented line", "text")).toBe(
      "# Chapter 1\n\nindented line",
    );
  });
});
