import { describe, expect, it } from "vitest";

import {
  generationResetMetadata,
  generationResetSource,
  isGenerationResetSource,
  shouldArchiveGenerationReset,
} from "./generation-archive";

describe("generation reset archive metadata", () => {
  it("round-trips title and summary without placing an envelope in the prose", () => {
    const source = generationResetSource({
      title: `The Cartographer's "Last" Door`,
      summary: "A map folds in on itself.",
      status: "drafted",
    });

    expect(isGenerationResetSource(source)).toBe(true);
    expect(generationResetMetadata(source)).toEqual({
      title: `The Cartographer's "Last" Door`,
      summary: "A map folds in on itself.",
      status: "drafted",
    });
  });

  it("keeps legacy reset revisions recoverable", () => {
    expect(isGenerationResetSource("generation-reset")).toBe(true);
    expect(generationResetMetadata("generation-reset")).toBeNull();
  });

  it("rejects unrelated or malformed source metadata", () => {
    expect(isGenerationResetSource("writer")).toBe(false);
    expect(generationResetMetadata("generation-reset:%not-json")).toBeNull();
  });

  it("archives blank surplus metadata before the reset nulls it", () => {
    const blankSurplus = {
      content: "",
      title: "The Unwritten Crossing",
      summary: "A planned crossing preserved for recovery.",
    };
    expect(shouldArchiveGenerationReset(blankSurplus, true, false)).toBe(true);
    expect(shouldArchiveGenerationReset(blankSurplus, true, true)).toBe(false);
    expect(shouldArchiveGenerationReset(blankSurplus, false, false)).toBe(false);
  });
});
