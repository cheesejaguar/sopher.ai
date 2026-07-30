import { describe, expect, it } from "vitest";

import { createProjectSchema, projectBriefSchema, projectTitleSchema } from "./project";

describe("new project validation", () => {
  it("rejects whitespace-only titles and briefs at the shared server boundary", () => {
    expect(projectTitleSchema.safeParse("   ").success).toBe(false);
    expect(projectBriefSchema.safeParse("                         ").success).toBe(false);
  });

  it("trims author input before it is persisted or frozen into a run", () => {
    expect(projectTitleSchema.parse("  The River Door  ")).toBe("The River Door");
    expect(
      projectBriefSchema.parse(
        "  A cartographer follows a disappearing road into a forgotten country.  ",
      ),
    ).toBe("A cartographer follows a disappearing road into a forgotten country.");
  });

  it("rejects tampered short briefs even when the other project fields are valid", () => {
    expect(
      createProjectSchema.safeParse({
        title: "The River Door",
        brief: "Too short",
        genre: "Fantasy",
        targetChapters: 3,
        targetWordsPerChapter: 1_000,
        settings: {},
      }).success,
    ).toBe(false);
  });
});
