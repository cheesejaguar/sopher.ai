// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import { markdownSelection } from "@/lib/editor/markdown-offsets";
import { findAnchorRangeInDoc } from "@/lib/editor/doc-text";

import { ImageNode } from "./image-node";

const SAMPLE = [
  "# Chapter One",
  "",
  "The harbor was quiet at dawn, and *Tomas* walked the pier slowly.",
  "",
  "By noon the storm had turned the sky green. He ran for the boathouse.",
].join("\n");

type MarkdownStorage = {
  getMarkdown(): string;
  serializer: { serialize(doc: PMNode): string };
};

function createEditor(content: string): Editor {
  return new Editor({
    element: document.createElement("div"),
    extensions: [StarterKit, Markdown.configure({ html: false, tightLists: true }), ImageNode],
    content,
  });
}

function storage(editor: Editor): MarkdownStorage {
  return (editor.storage as unknown as { markdown: MarkdownStorage }).markdown;
}

describe("editor markdown integration", () => {
  it("round-trips markdown content through the editor", () => {
    const editor = createEditor(SAMPLE);
    const md = storage(editor).getMarkdown();
    expect(md).toContain("# Chapter One");
    expect(md).toContain("*Tomas*");
    expect(md).toContain("He ran for the boathouse.");
    // Serialization is stable: parsing our own output again is a fixpoint.
    const editor2 = createEditor(md);
    expect(storage(editor2).getMarkdown()).toBe(md);
    editor.destroy();
    editor2.destroy();
  });

  it("round-trips fenced mermaid blocks and markdown images", () => {
    const withExtras = `${SAMPLE}\n\n\`\`\`mermaid\nflowchart TD\n  A --> B\n\`\`\`\n\n![A quiet harbor](https://example.com/x.png)`;
    const editor = createEditor(withExtras);
    const md = storage(editor).getMarkdown();
    expect(md).toContain("```mermaid");
    expect(md).toContain("A --> B");
    expect(md).toContain("![A quiet harbor](https://example.com/x.png)");
    editor.destroy();
  });

  it("maps a ProseMirror selection to exact markdown offsets via sentinels", () => {
    const editor = createEditor(SAMPLE);
    const serialize = (doc: PMNode) => storage(editor).serializer.serialize(doc);
    const clean = storage(editor).getMarkdown();

    // Select the words "walked the pier" inside the italicized paragraph.
    const range = findAnchorRangeInDoc(editor.state.doc, "walked the pier");
    expect(range).not.toBeNull();
    const tr = editor.state.tr.setSelection(
      TextSelection.create(editor.state.doc, range!.from, range!.to),
    );
    editor.view.dispatch(tr);

    const sel = markdownSelection(editor.state, serialize, range!.from, range!.to);
    expect(sel).not.toBeNull();
    expect(sel!.text).toBe("walked the pier");
    expect(clean.slice(sel!.start, sel!.end)).toBe("walked the pier");
    editor.destroy();
  });

  it("inserts a mermaid code block as JSON content through the markdown extension", () => {
    const editor = createEditor(SAMPLE);
    const end = editor.state.doc.content.size;
    editor.commands.insertContentAt(end, {
      type: "codeBlock",
      attrs: { language: "mermaid" },
      content: [{ type: "text", text: "flowchart TD\n  X --> Y" }],
    });
    const md = storage(editor).getMarkdown();
    expect(md).toContain("```mermaid");
    expect(md).toContain("X --> Y");
    editor.destroy();
  });
});
