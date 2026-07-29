import { describe, expect, it } from "vitest";

import { moderationVerdictSchema, chapterSummarySchema, conceptSchema } from "@/ai/schemas";
import { MODERATION_PROMPT } from "./moderation";

describe("moderation verdict schema", () => {
  it("defaults to unflagged so the model must opt in", () => {
    expect(moderationVerdictSchema.parse({})).toEqual({ flagged: false });
  });

  it("rides the summarizer schema with a safe default", () => {
    const parsed = chapterSummarySchema.parse({ summary: "s", newFacts: [] });
    expect(parsed.moderation.flagged).toBe(false);
  });

  it("rides the concept schema with a safe default", () => {
    const parsed = conceptSchema.parse({
      title: "t",
      logline: "l",
      synopsis: "s",
      themes: [],
      setting: "x",
      centralConflict: "c",
      uniqueElements: [],
      characters: [],
    });
    expect(parsed.moderation.flagged).toBe(false);
  });

  it("accepts a full flag", () => {
    const v = moderationVerdictSchema.parse({
      flagged: true,
      category: "real_person",
      excerpt: "…",
      reason: "names a real person in sexual content",
    });
    expect(v.category).toBe("real_person");
  });
});

describe("moderation prompt scope", () => {
  it("names every category and explicitly exempts adult fiction", () => {
    for (const term of ["minors", "nonconsent", "real_person", "hate_incitement", "self_harm"]) {
      expect(MODERATION_PROMPT).toContain(term);
    }
    expect(MODERATION_PROMPT).toContain("NOT flags");
  });
});
