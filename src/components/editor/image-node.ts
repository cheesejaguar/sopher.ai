import { mergeAttributes, Node } from "@tiptap/react";

/**
 * Minimal inline image node so `![alt](url)` round-trips through
 * tiptap-markdown (which ships a default markdown spec for a node named
 * "image"): markdown-it parses the image to `<img>`, this node picks it up
 * via parseHTML, and serialization emits standard markdown image syntax.
 */
export const ImageNode = Node.create({
  name: "image",
  inline: true,
  group: "inline",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      title: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        class: "my-4 max-w-full rounded-md border border-paper-edge shadow-sm",
        loading: "lazy",
      }),
    ];
  },
});
