import { describe, expect, it } from "vitest";

import {
  assertAuthoringToolMutationReplayCompatible,
  AuthoringToolMutationReplayConflictError,
  authoringToolMutationKey,
} from "@/ai/tools/authoring-mutation";

describe("authoringToolMutationKey", () => {
  it("is stable across object-key order and scoped to tool and chapter", () => {
    const first = authoringToolMutationKey({
      toolName: "entityUpsert",
      chapterNumber: 2,
      payload: { name: "Mara", attrs: { role: "guide", facts: ["Keeps the map"] } },
    });
    const reordered = authoringToolMutationKey({
      toolName: "entityUpsert",
      chapterNumber: 2,
      payload: { attrs: { facts: ["Keeps the map"], role: "guide" }, name: "Mara" },
    });

    expect(reordered).toBe(first);
    expect(
      authoringToolMutationKey({
        toolName: "entityUpsert",
        chapterNumber: 3,
        payload: { name: "Mara", attrs: { role: "guide", facts: ["Keeps the map"] } },
      }),
    ).not.toBe(first);
  });

  it("fails closed when a stable call position regenerates different mutation content", () => {
    expect(() =>
      assertAuthoringToolMutationReplayCompatible(
        "tool:entityUpsert:1:old",
        "tool:entityUpsert:1:new",
      ),
    ).toThrow(AuthoringToolMutationReplayConflictError);
    expect(() =>
      assertAuthoringToolMutationReplayCompatible(
        "tool:entityUpsert:1:exact",
        "tool:entityUpsert:1:exact",
      ),
    ).not.toThrow();
  });
});
