import { describe, expect, it } from "vitest";

import { EDITOR_SYSTEM_PROMPT, buildEditUserPrompt } from "./editor";

describe("EDITOR_SYSTEM_PROMPT", () => {
  it("carries the role and all five editing principles", () => {
    expect(EDITOR_SYSTEM_PROMPT).toContain("expert fiction editor");
    expect(EDITOR_SYSTEM_PROMPT).toContain("### 1. Preserve Voice");
    expect(EDITOR_SYSTEM_PROMPT).toContain("### 2. Improve Clarity");
    expect(EDITOR_SYSTEM_PROMPT).toContain("### 3. Enhance Flow");
    expect(EDITOR_SYSTEM_PROMPT).toContain("### 4. Tighten Prose");
    expect(EDITOR_SYSTEM_PROMPT).toContain("### 5. Strengthen Scenes");
  });

  it("keeps the checklist and light-touch guidance", () => {
    for (const item of [
      "**Grammar & Mechanics**",
      "**Sentence Structure**",
      "**Word Choice**",
      "**Pacing**",
      "**Consistency**",
      "**Hooks**",
    ]) {
      expect(EDITOR_SYSTEM_PROMPT).toContain(item);
    }
    expect(EDITOR_SYSTEM_PROMPT).toContain("The goal is refinement, not rewriting.");
    expect(EDITOR_SYSTEM_PROMPT).toContain("changes_made");
  });

  it("respects writer intent without referencing old tools", () => {
    expect(EDITOR_SYSTEM_PROMPT).toContain("intentional style choices");
    expect(EDITOR_SYSTEM_PROMPT).not.toContain("get_chapter_content");
    expect(EDITOR_SYSTEM_PROMPT).not.toContain("get_writer_notes");
    expect(EDITOR_SYSTEM_PROMPT).not.toContain("send_message");
    expect(EDITOR_SYSTEM_PROMPT).not.toContain("Tool Workflow");
  });
});

describe("buildEditUserPrompt", () => {
  it("includes draft, style guide, outline, and writer notes", () => {
    const prompt = buildEditUserPrompt({
      chapterNumber: 3,
      chapterContent: "The rain would not stop.",
      styleGuide: "Sparse prose.",
      chapterOutline: "Storm strands the party at the inn.",
      writerStyleNotes: ["Sentence fragments in the storm scene are intentional"],
    });
    expect(prompt).toContain("## Chapter 3 Draft\n\nThe rain would not stop.");
    expect(prompt).toContain("## Style Guide\n\nSparse prose.");
    expect(prompt).toContain("Storm strands the party at the inn.");
    expect(prompt).toContain("respect these");
    expect(prompt).toContain("- Sentence fragments in the storm scene are intentional");
    expect(prompt).toContain("Edit Chapter 3");
  });

  it("omits the notes section when there are no notes", () => {
    const prompt = buildEditUserPrompt({
      chapterNumber: 1,
      chapterContent: "Draft text.",
      writerStyleNotes: [],
    });
    expect(prompt).not.toContain("Intentional Style Choices");
  });
});
