import type { Node as PMNode } from "@tiptap/pm/model";

import type { ContentToolOutputDTO } from "@/lib/editor/types";

/** Detect a previously inserted durable delivery before applying a replay. */
export function editorContainsContentToolOutput(
  doc: PMNode,
  output: ContentToolOutputDTO,
): boolean {
  let found = false;
  doc.descendants((node) => {
    if (found) return false;
    if (output.kind === "mermaid") {
      found =
        node.type.name === "codeBlock" &&
        node.attrs.language === "mermaid" &&
        node.textContent === output.source;
    } else {
      found = node.type.name === "image" && node.attrs.src === output.url;
    }
    return !found;
  });
  return found;
}
