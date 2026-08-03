import { describe, expect, it } from "vitest";

import {
  buildBookFactsSection,
  buildMatterDraftUserPrompt,
  buildPublishingKitUserPrompt,
  MATTER_DRAFT_GUIDANCE,
  MATTER_DRAFT_SYSTEM_PROMPT,
  MAX_SUMMARIES_SENT,
  PUBLISHING_KIT_SYSTEM_PROMPT,
  type PublishingBookFacts,
} from "./publishing-kit";
import { BOOK_MATTER_DRAFT_FIELDS } from "@/lib/book-package";

const book: PublishingBookFacts = {
  title: "The Salt Road",
  subtitle: "A Novel",
  author: "A. Writer",
  genre: "Fantasy",
  subgenre: "Epic",
  synopsis: "A cartographer walks a road that erases the places she maps.",
  logline: "A mapmaker must finish a road that unmakes the world.",
  themes: ["memory", "debt"],
  setting: "The salt flats of Ennes",
  centralConflict: "Finish the map or keep the coast",
  uniqueElements: ["maps that forget"],
  characters: [{ name: "Ilse", role: "cartographer" }],
  totalChapters: 12,
  chapterSummaries: ["Ilse takes the commission.", "The first village is missing."],
};

describe("publishing kit system prompts", () => {
  it("keeps the selling principles and the no-invention rule", () => {
    expect(PUBLISHING_KIT_SYSTEM_PROMPT).toContain("### 3. Never spoil");
    expect(PUBLISHING_KIT_SYSTEM_PROMPT).toContain("### 5. No invented facts");
    expect(PUBLISHING_KIT_SYSTEM_PROMPT).toContain("**Keywords**");
    expect(PUBLISHING_KIT_SYSTEM_PROMPT).toContain("Fiction > Fantasy > Epic");
  });

  it("tells the matter drafter it is proposing, not signing for the author", () => {
    expect(MATTER_DRAFT_SYSTEM_PROMPT).toContain("accept, rewrite, or throw away");
    expect(MATTER_DRAFT_SYSTEM_PROMPT).toContain("[name]");
  });

  it("carries no book-specific content, so it stays a stable cache prefix", () => {
    for (const prompt of [PUBLISHING_KIT_SYSTEM_PROMPT, MATTER_DRAFT_SYSTEM_PROMPT]) {
      expect(prompt).not.toContain("{");
      expect(prompt).not.toContain("The Salt Road");
    }
  });

  it("guides every draftable matter field", () => {
    for (const field of BOOK_MATTER_DRAFT_FIELDS) {
      expect(MATTER_DRAFT_GUIDANCE[field].brief.length).toBeGreaterThan(40);
    }
  });
});

describe("buildBookFactsSection", () => {
  it("includes the identity, synopsis, and summarised chapters", () => {
    const section = buildBookFactsSection(book);
    expect(section).toContain("- Title: The Salt Road");
    expect(section).toContain("- Genre: Fantasy / Epic");
    expect(section).toContain("- Length: 12 chapters");
    expect(section).toContain("- Themes: memory; debt");
    expect(section).toContain("- Principal characters: Ilse (cartographer)");
    expect(section).toContain("A cartographer walks a road that erases the places she maps.");
    expect(section).toContain("1. Ilse takes the commission.");
    expect(section).toContain("These are the chapters the author has summarised so far.");
  });

  it("omits every fact the author has not filled in", () => {
    const section = buildBookFactsSection({ title: "Untitled" });
    expect(section).toContain("- Title: Untitled");
    expect(section).not.toContain("Genre");
    expect(section).not.toContain("## Synopsis");
    expect(section).not.toContain("Opening chapters");
  });

  it("sends only the opening chapters so the copy cannot spoil the ending", () => {
    const summaries = Array.from({ length: 60 }, (_, index) => `Chapter ${index + 1} happens.`);
    const section = buildBookFactsSection({ ...book, chapterSummaries: summaries });

    expect(section).toContain(`Only the first ${MAX_SUMMARIES_SENT} of 60 summarised chapters`);
    expect(section).toContain(`${MAX_SUMMARIES_SENT}. Chapter ${MAX_SUMMARIES_SENT} happens.`);
    expect(section).not.toContain("Chapter 60 happens.");
  });

  it("bounds a hostile book so the request stays inside the metered input envelope", () => {
    const huge = "x".repeat(50_000);
    const section = buildBookFactsSection({
      title: huge,
      subtitle: huge,
      author: huge,
      synopsis: huge,
      logline: huge,
      setting: huge,
      centralConflict: huge,
      themes: Array.from({ length: 50 }, () => huge),
      uniqueElements: Array.from({ length: 50 }, () => huge),
      characters: Array.from({ length: 50 }, () => ({ name: huge, role: huge })),
      chapterSummaries: Array.from({ length: 200 }, () => huge),
    });

    expect(new TextEncoder().encode(section).byteLength).toBeLessThan(56_000);
  });
});

describe("buildPublishingKitUserPrompt", () => {
  it("asks for every kit field and carries the author's focus", () => {
    const prompt = buildPublishingKitUserPrompt({
      ...book,
      instruction: "Lean into the horror edge",
    });
    expect(prompt).toContain("back-cover blurb, store description, keywords, categories");
    expect(prompt).toContain("## What the author asked for\n\nLean into the horror edge");
    expect(prompt).toContain("never spoil the ending");
  });

  it("drops an empty instruction rather than emitting a blank section", () => {
    expect(buildPublishingKitUserPrompt({ ...book, instruction: "   " })).not.toContain(
      "What the author asked for",
    );
  });
});

describe("buildMatterDraftUserPrompt", () => {
  it("asks for exactly one page and forbids surrounding commentary", () => {
    const prompt = buildMatterDraftUserPrompt({ ...book, field: "dedication" });
    expect(prompt).toContain("Draft the dedication page for this book.");
    expect(prompt).toContain(MATTER_DRAFT_GUIDANCE.dedication.brief);
    expect(prompt).toContain("Return only the page text itself.");
  });

  it("carries each field's own craft brief", () => {
    for (const field of BOOK_MATTER_DRAFT_FIELDS) {
      const prompt = buildMatterDraftUserPrompt({ ...book, field });
      expect(prompt).toContain(MATTER_DRAFT_GUIDANCE[field].label.toLowerCase());
      expect(prompt).toContain(MATTER_DRAFT_GUIDANCE[field].brief);
    }
  });
});
