import { describe, expect, it } from "vitest";

import { isSafeHref, safeInternalPath } from "./url";
import { markdownToHtml } from "@/lib/export/assemble";

describe("isSafeHref", () => {
  it("allows the schemes a manuscript legitimately uses", () => {
    expect(isSafeHref("https://example.com/a?b=1#c")).toBe(true);
    expect(isSafeHref("http://example.com")).toBe(true);
    expect(isSafeHref("mailto:support@sopher.ai")).toBe(true);
  });

  it("allows relative references so footnotes and contents links survive", () => {
    expect(isSafeHref("/pricing")).toBe(true);
    expect(isSafeHref("#chapter-3")).toBe(true);
    expect(isSafeHref("?page=2")).toBe(true);
    expect(isSafeHref("chapter-2.html")).toBe(true);
  });

  it("rejects script-bearing schemes", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html;base64,PHNjcmlwdD4=")).toBe(false);
    expect(isSafeHref("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHref("file:///etc/passwd")).toBe(false);
  });

  it("rejects the spellings a denylist would miss", () => {
    expect(isSafeHref("JaVaScRiPt:alert(1)")).toBe(false);
    expect(isSafeHref("  javascript:alert(1)")).toBe(false);
    expect(isSafeHref("java\tscript:alert(1)")).toBe(false);
    expect(isSafeHref("java\nscript:alert(1)")).toBe(false);
    expect(isSafeHref("java\u0000script:alert(1)")).toBe(false);
    expect(isSafeHref("java script:alert(1)")).toBe(false);
    expect(isSafeHref("\u0001javascript:alert(1)")).toBe(false);
  });

  it("rejects protocol-relative URLs and empties", () => {
    expect(isSafeHref("//evil.example")).toBe(false);
    expect(isSafeHref("")).toBe(false);
    expect(isSafeHref("   ")).toBe(false);
  });
});

/**
 * The renderer wiring, not just the predicate — a correct allowlist behind a
 * renderer override that never fires would still ship the vulnerability.
 */
describe("markdownToHtml link and image hrefs", () => {
  it("strips javascript: and data: links to plain text", () => {
    const html = markdownToHtml("[click](javascript:alert(document.cookie))");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
    expect(html).toContain("click");
  });

  it("strips javascript: image sources", () => {
    const html = markdownToHtml("![boom](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<img");
  });

  it("strips data: URLs that could carry an HTML payload", () => {
    const html = markdownToHtml("[b](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)");
    expect(html).not.toContain("data:text/html");
    expect(html).not.toContain("<a ");
  });

  it("still renders ordinary links and images", () => {
    const link = markdownToHtml("[home](https://sopher.ai)");
    expect(link).toContain('href="https://sopher.ai"');
    const image = markdownToHtml("![cover](https://example.com/cover.png)");
    expect(image).toContain('src="https://example.com/cover.png"');
  });

  it("keeps escaping raw HTML, as before", () => {
    expect(markdownToHtml("<img src=x onerror=alert(1)>")).not.toContain("<img");
  });
});

describe("safeInternalPath", () => {
  it("accepts in-app paths and preserves query and hash", () => {
    expect(safeInternalPath("/studio")).toBe("/studio");
    expect(safeInternalPath("/projects/abc/write?tab=outline#ch2")).toBe(
      "/projects/abc/write?tab=outline#ch2",
    );
  });

  it("rejects anything that leaves the origin", () => {
    // The backslash form is the one the old regex and startsWith checks let
    // through: it starts with "/" and the second character is not "/", but
    // browsers normalize it to "//evil.example".
    expect(safeInternalPath("/\\evil.example")).toBeNull();
    expect(safeInternalPath("//evil.example")).toBeNull();
    expect(safeInternalPath("/\\/\\evil.example")).toBeNull();
    expect(safeInternalPath("https://evil.example")).toBeNull();
    expect(safeInternalPath("javascript:alert(1)")).toBeNull();
    expect(safeInternalPath("evil.example")).toBeNull();
  });

  it("rejects empty and missing values", () => {
    expect(safeInternalPath(null)).toBeNull();
    expect(safeInternalPath(undefined)).toBeNull();
    expect(safeInternalPath("")).toBeNull();
  });
});
