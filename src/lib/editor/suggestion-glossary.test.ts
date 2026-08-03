import { describe, expect, it } from "vitest";

import { PROOFREAD_CATEGORIES } from "@/ai/prompts/proofread";

import {
  SUGGESTION_GLOSSARY,
  suggestionGlossaryEntry,
  suggestionTypeLabel,
} from "./suggestion-glossary";

/** Every suggestionType the app writes today, outside the proofread pass. */
const EDITOR_TYPES = ["line", "structure", "continuity", "style", "selection"];

describe("SUGGESTION_GLOSSARY", () => {
  it("covers every type the editor agent and the selection route produce", () => {
    for (const type of EDITOR_TYPES) {
      expect(SUGGESTION_GLOSSARY[type]).toBeDefined();
    }
  });

  it("covers every category the proofreader can return", () => {
    for (const category of PROOFREAD_CATEGORIES) {
      expect(SUGGESTION_GLOSSARY[category]).toBeDefined();
    }
  });

  it("titles are short plain English, not the stored slug", () => {
    for (const [type, entry] of Object.entries(SUGGESTION_GLOSSARY)) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.title.length).toBeLessThanOrEqual(24);
      expect(entry.title).not.toBe(type);
      expect(entry.title[0]).toBe(entry.title[0].toUpperCase());
    }
  });

  it("meanings are one finished sentence each", () => {
    for (const entry of Object.values(SUGGESTION_GLOSSARY)) {
      expect(entry.meaning).toMatch(/\.$/);
      expect(entry.meaning).not.toContain("\n");
      // One sentence: no full stop before the last character.
      expect(entry.meaning.slice(0, -1)).not.toMatch(/\.\s/);
    }
  });
});

describe("suggestionGlossaryEntry", () => {
  it("explains a known type", () => {
    expect(suggestionGlossaryEntry("usage")).toEqual({
      title: "Word mix-up",
      meaning: expect.stringContaining("correctly spelled word"),
    });
  });

  it("keeps an unknown type visible with a generic explanation", () => {
    const entry = suggestionGlossaryEntry("something-new");
    expect(entry.title).toBe("something-new");
    expect(entry.meaning).toBe("A suggested change to this passage.");
  });
});

describe("suggestionTypeLabel", () => {
  it("returns the glossary title", () => {
    expect(suggestionTypeLabel("line")).toBe("Line edit");
    expect(suggestionTypeLabel("selection")).toBe("Your request");
    expect(suggestionTypeLabel("duplication")).toBe("Repeated word");
  });

  it("falls back to the raw type, as the panel headings always have", () => {
    expect(suggestionTypeLabel("mystery")).toBe("mystery");
  });
});
