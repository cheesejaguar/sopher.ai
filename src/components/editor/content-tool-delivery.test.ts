import type { Node as PMNode } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";

import { editorContainsContentToolOutput } from "./content-tool-delivery";

function documentWith(
  nodes: Array<{ type: string; attrs?: Record<string, unknown>; text?: string }>,
): PMNode {
  return {
    descendants(callback: (node: PMNode) => boolean | void) {
      for (const value of nodes) {
        callback({
          type: { name: value.type },
          attrs: value.attrs ?? {},
          textContent: value.text ?? "",
        } as unknown as PMNode);
      }
    },
  } as unknown as PMNode;
}

describe("content-tool delivery replay detection", () => {
  it("recognizes an already inserted mermaid delivery", () => {
    const doc = documentWith([
      { type: "paragraph", text: "Context" },
      {
        type: "codeBlock",
        attrs: { language: "mermaid" },
        text: "flowchart LR\nA --> B",
      },
    ]);

    expect(
      editorContainsContentToolOutput(doc, {
        kind: "mermaid",
        source: "flowchart LR\nA --> B",
      }),
    ).toBe(true);
  });

  it("recognizes only the exact illustration URL", () => {
    const doc = documentWith([
      {
        type: "image",
        attrs: { src: "https://blob.example/delivery.webp" },
      },
    ]);

    expect(
      editorContainsContentToolOutput(doc, {
        kind: "image",
        url: "https://blob.example/delivery.webp",
        alt: "A storm-lit harbor",
      }),
    ).toBe(true);
    expect(
      editorContainsContentToolOutput(doc, {
        kind: "image",
        url: "https://blob.example/another.webp",
        alt: "A different image",
      }),
    ).toBe(false);
  });
});
