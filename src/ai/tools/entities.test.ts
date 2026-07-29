import { describe, expect, it } from "vitest";

import { findConflicts } from "./entities";
import {
  GUARDED_ATTRS,
  KIND_TO_ISSUE_CATEGORY,
  attrsSchemaFor,
  parseAttrs,
  ENTITY_KINDS,
} from "@/ai/schemas/entities";

describe("per-kind attribute schemas", () => {
  it("gives every kind a schema", () => {
    for (const kind of ENTITY_KINDS) {
      expect(attrsSchemaFor(kind)).toBeDefined();
    }
  });

  it("defaults list fields so the jsonb merge always has an array to concat", () => {
    for (const kind of ENTITY_KINDS) {
      const parsed = parseAttrs(kind, {}) as { facts?: string[] };
      expect(Array.isArray(parsed.facts)).toBe(true);
    }
  });

  it("keeps the kind-specific fields the bible depends on", () => {
    const character = parseAttrs("character", {
      heritage: "Coastal Averrin",
      nameRationale: "Shares the Vantry surname with her mother",
      appearance: "tide-weathered, rope-scarred hands",
      bogus: "dropped",
    }) as Record<string, unknown>;
    expect(character.heritage).toBe("Coastal Averrin");
    expect(character.nameRationale).toContain("Vantry");
    expect(character.bogus).toBeUndefined();
  });

  it("records what a location contains — the television-in-the-den case", () => {
    const location = parseAttrs("location", {
      locationType: "family home",
      contents: ["a television in the den", "her father's charts"],
    }) as Record<string, unknown>;
    expect(location.contents).toEqual(["a television in the den", "her father's charts"]);
  });

  it("drops malformed attrs rather than throwing mid-generation", () => {
    const parsed = parseAttrs("object", { capabilities: "not-an-array" }) as {
      capabilities?: string[];
    };
    expect(Array.isArray(parsed.capabilities)).toBe(true);
  });
});

describe("findConflicts", () => {
  it("flags a guarded scalar changing — the drift we care about", () => {
    const conflicts = findConflicts(
      "character",
      { appearance: "grey eyes", facts: ["a"] },
      { appearance: "green eyes", facts: ["b"] },
    );
    expect(conflicts).toEqual([{ field: "appearance", from: "grey eyes", to: "green eyes" }]);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(
      findConflicts("character", { appearance: "Grey eyes" }, { appearance: " grey eyes " }),
    ).toEqual([]);
  });

  it("does not treat first-time establishment as a conflict", () => {
    expect(findConflicts("character", {}, { appearance: "grey eyes" })).toEqual([]);
  });

  it("does not treat an omitted field as a conflict", () => {
    expect(findConflicts("character", { appearance: "grey eyes" }, {})).toEqual([]);
  });

  it("never flags list fields — facts only ever accumulate", () => {
    const conflicts = findConflicts(
      "character",
      { facts: ["was in Averrin"], personality: ["blunt"] },
      { facts: ["left Averrin"], personality: ["warm"] },
    );
    expect(conflicts).toEqual([]);
  });

  it("guards object provenance so a sword cannot change origin", () => {
    const conflicts = findConflicts(
      "object",
      { provenance: "forged by her mother" },
      { provenance: "bought in the market" },
    );
    expect(conflicts.map((c) => c.field)).toEqual(["provenance"]);
  });

  it("guards a field for every kind", () => {
    for (const kind of ENTITY_KINDS) {
      expect(GUARDED_ATTRS[kind].length).toBeGreaterThan(0);
    }
  });
});

describe("KIND_TO_ISSUE_CATEGORY", () => {
  it("maps every kind onto the continuity_issues vocabulary", () => {
    const allowed = new Set(["character", "timeline", "setting", "plot", "factual"]);
    for (const kind of ENTITY_KINDS) {
      expect(allowed.has(KIND_TO_ISSUE_CATEGORY[kind])).toBe(true);
    }
  });
});

describe("review-bot regression: partial updates must not wipe lists", () => {
  // parseAttrs fills omitted list fields with [] — the upsert layer must strip
  // those before merging, or a facts-only update erases stored personality.
  it("parseAttrs defaults are distinguishable from provided values", () => {
    const onlyFacts = parseAttrs("character", { facts: ["new fact"] }) as Record<string, unknown>;
    expect(onlyFacts.personality).toEqual([]);
    // The upsert filter drops empty non-facts arrays; assert the shape it keys on.
    const kept = Object.entries(onlyFacts).filter(([key, value]) => {
      if (value === undefined || value === null) return false;
      if (Array.isArray(value) && value.length === 0 && key !== "facts") return false;
      if (typeof value === "string" && !value.trim()) return false;
      return true;
    });
    expect(kept.map(([k]) => k)).toEqual(["facts"]);
  });
});
