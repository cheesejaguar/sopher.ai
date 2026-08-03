/**
 * Remove transport formatting that can accidentally turn an entire generated
 * chapter into an indented Markdown code block. A shared outer indent is not
 * meaningful manuscript formatting; fenced code inside the chapter remains
 * fenced after the outer indent is removed.
 */
export function normalizeManuscriptMarkdown(source: string): string {
  let markdown = source
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .replace(/(?:\n[ \t]*)+$/, "");

  const wrapper = markdown.match(/^```(?:markdown|md|text)[ \t]*\n([\s\S]*?)\n```[ \t]*$/i);
  if (wrapper) {
    markdown = wrapper[1].replace(/^(?:[ \t]*\n)+/, "").replace(/(?:\n[ \t]*)+$/, "");
  }

  const lines = markdown.split("\n");
  const populated = lines.filter((line) => line.trim().length > 0);
  if (populated.length === 0) return "";

  const indentation = populated.map((line) => line.match(/^[ \t]*/)?.[0] ?? "");
  const sharedColumns = Math.min(
    ...indentation.map((prefix) =>
      [...prefix].reduce((columns, character) => columns + (character === "\t" ? 4 : 1), 0),
    ),
  );

  // Markdown treats four leading columns as code. Anything smaller may be an
  // intentional visual indent and is left alone, apart from the outer trim
  // manuscript assembly and chapter generation have always applied.
  if (sharedColumns < 4) return markdown.trim();

  return lines
    .map((line) => {
      if (!line.trim()) return "";
      let remaining = sharedColumns;
      let offset = 0;
      while (remaining > 0 && offset < line.length) {
        const character = line[offset];
        if (character === " ") remaining -= 1;
        else if (character === "\t") remaining -= 4;
        else break;
        offset += 1;
      }
      return line.slice(offset);
    })
    .join("\n")
    .trim();
}
