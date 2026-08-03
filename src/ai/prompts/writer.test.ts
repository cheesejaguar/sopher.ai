import { describe, expect, it } from "vitest";

import {
  CHAPTER_PROSE_RESPONSE_FORMAT,
  WRITER_SYSTEM_PROMPT,
  buildChapterUserPrompt,
} from "./writer";

describe("WRITER_SYSTEM_PROMPT", () => {
  it("carries the role and all five writing principles", () => {
    expect(WRITER_SYSTEM_PROMPT).toContain("skilled fiction writer");
    expect(WRITER_SYSTEM_PROMPT).toContain("### 1. Show, Don't Tell");
    expect(WRITER_SYSTEM_PROMPT).toContain("### 2. Scene Construction");
    expect(WRITER_SYSTEM_PROMPT).toContain("### 3. Dialogue Excellence");
    expect(WRITER_SYSTEM_PROMPT).toContain("### 4. Pacing Control");
    expect(WRITER_SYSTEM_PROMPT).toContain("### 5. Consistency");
  });

  it("instructs the new story-memory workflow", () => {
    expect(WRITER_SYSTEM_PROMPT).toContain("consult the character bible");
    expect(WRITER_SYSTEM_PROMPT).toContain("search the story-so-far");
    expect(WRITER_SYSTEM_PROMPT).toContain("record every new canonical fact");
  });

  it("does not reference the old tool workflow", () => {
    expect(WRITER_SYSTEM_PROMPT).not.toContain("get_chapter_outline");
    expect(WRITER_SYSTEM_PROMPT).not.toContain("get_previous_chapters");
    expect(WRITER_SYSTEM_PROMPT).not.toContain("send_message");
    expect(WRITER_SYSTEM_PROMPT).not.toContain("Tool Workflow");
  });

  it("keeps chapter requirements without constraining structured-output calls", () => {
    expect(WRITER_SYSTEM_PROMPT).toContain("Match the target word count (within 10%)");
    expect(WRITER_SYSTEM_PROMPT).not.toContain("Return only the chapter prose in plain Markdown");
    expect(WRITER_SYSTEM_PROMPT).not.toContain("Do not wrap it in JSON");
    expect(WRITER_SYSTEM_PROMPT).not.toContain("valid JSON object");
    expect(WRITER_SYSTEM_PROMPT).toContain("End with a hook that encourages continued reading");
  });

  it("keeps prose-only formatting scoped to chapter drafts", () => {
    expect(CHAPTER_PROSE_RESPONSE_FORMAT).toContain(
      "Return only the chapter prose in plain Markdown",
    );
    expect(CHAPTER_PROSE_RESPONSE_FORMAT).toContain("Do not wrap it in JSON");
    expect(CHAPTER_PROSE_RESPONSE_FORMAT).toContain("indented code block");
  });
});

describe("buildChapterUserPrompt", () => {
  it("includes the outline slice and all optional context", () => {
    const prompt = buildChapterUserPrompt({
      chapterNumber: 7,
      chapterOutline: "The crew breaches the vault.",
      styleGuide: "Terse, noir-inflected prose.",
      genre: "thriller",
      characterBible: "Rig: green eyes, never swears.",
      storySoFar: "Chapters 1-6 established the plan.",
      targetWordCount: 3500,
      contentGuidelines: "## Content Guidelines\nNo profanity.",
    });
    expect(prompt).toContain("## Chapter 7 Outline\n\nThe crew breaches the vault.");
    expect(prompt).toContain("Terse, noir-inflected prose.");
    expect(prompt).toContain("## Character Bible\n\nRig: green eyes, never swears.");
    expect(prompt).toContain("## Story So Far\n\nChapters 1-6 established the plan.");
    expect(prompt).toContain("Target word count: 3500 words (within 10%).");
    expect(prompt).toContain("Write Chapter 7 following the outline faithfully.");
  });

  it("omits the word target when not provided", () => {
    const prompt = buildChapterUserPrompt({
      chapterNumber: 1,
      chapterOutline: "Opening image.",
    });
    expect(prompt).not.toContain("Target word count");
    expect(prompt).toContain("Write Chapter 1 following the outline faithfully.");
  });
});
