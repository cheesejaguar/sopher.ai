// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { generationResetSource } from "@/lib/generation-archive";

import { revisionSourceLabel } from "./history-panel";

describe("revisionSourceLabel", () => {
  it("never leaks encoded generation-reset metadata into History", () => {
    const source = generationResetSource({
      title: "The Original Crossing",
      summary: "Mara enters the drowned city.",
    });

    expect(revisionSourceLabel(source)).toBe("Before a new book run");
    expect(revisionSourceLabel(source)).not.toContain("%");
  });
});
