import { describe, expect, it } from "vitest";
import { Schema, type Node as PMNode } from "@tiptap/pm/model";

import { findAnchorRangeInDoc, findTextRange, indexDocText } from "./doc-text";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: { em: {} },
});

function para(...runs: PMNode[]): PMNode {
  return schema.node("paragraph", null, runs);
}

const plain = (t: string) => schema.text(t);
const em = (t: string) => schema.text(t, [schema.mark("em")]);

describe("indexDocText", () => {
  it("joins blocks with a blank line", () => {
    const doc = schema.node("doc", null, [para(plain("Hello world.")), para(plain("Second one."))]);
    expect(indexDocText(doc).text).toBe("Hello world.\n\nSecond one.");
  });

  it("maps text offsets back to ProseMirror positions", () => {
    const doc = schema.node("doc", null, [para(plain("Hello world.")), para(plain("Second one."))]);
    const index = indexDocText(doc);
    const offset = index.text.indexOf("world");
    const range = index.toPmRange(offset, offset + "world".length)!;
    expect(doc.textBetween(range.from, range.to)).toBe("world");

    const second = index.text.indexOf("Second");
    const range2 = index.toPmRange(second, second + "Second".length)!;
    expect(doc.textBetween(range2.from, range2.to)).toBe("Second");
  });

  it("spans marked text runs transparently", () => {
    const doc = schema.node("doc", null, [
      para(plain("He said "), em("quietly"), plain(" and left.")),
    ]);
    const index = indexDocText(doc);
    expect(index.text).toBe("He said quietly and left.");
    const offset = index.text.indexOf("said quietly and");
    const range = index.toPmRange(offset, offset + "said quietly and".length)!;
    expect(doc.textBetween(range.from, range.to)).toBe("said quietly and");
  });
});

describe("findTextRange", () => {
  it("finds exact matches", () => {
    expect(findTextRange("abc def", "def")).toEqual({ start: 4, end: 7 });
  });

  it("tolerates differing whitespace runs", () => {
    const range = findTextRange("world.\n\nSecond", "world. Second")!;
    expect(range).toEqual({ start: 0, end: 14 });
  });

  it("returns null when absent", () => {
    expect(findTextRange("abc", "xyz")).toBeNull();
    expect(findTextRange("abc", "")).toBeNull();
  });
});

describe("findAnchorRangeInDoc", () => {
  const doc = schema.node("doc", null, [
    para(plain("The storm rolled east and the "), em("water"), plain(" calmed.")),
    para(plain("But the ferry was gone.")),
  ]);

  it("locates a quote inside one paragraph across marks", () => {
    const range = findAnchorRangeInDoc(doc, "the water calmed")!;
    expect(doc.textBetween(range.from, range.to)).toBe("the water calmed");
  });

  it("locates a quote spanning two paragraphs (markdown blank line)", () => {
    const range = findAnchorRangeInDoc(doc, "calmed.\n\nBut the ferry")!;
    expect(doc.textBetween(range.from, range.to, "\n\n")).toBe("calmed.\n\nBut the ferry");
  });

  it("returns null for vanished quotes", () => {
    expect(findAnchorRangeInDoc(doc, "the lighthouse keeper")).toBeNull();
  });
});
