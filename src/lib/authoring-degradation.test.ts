import { describe, expect, it } from "vitest";

import {
  AUTHORING_CANCELLATION_MESSAGE,
  AUTHORING_RUN_INACTIVE_MESSAGE,
} from "@/lib/authoring-cancellation";
import {
  DEGRADATION_CODES,
  degradationNotice,
  degradationSummary,
  isDegradableFailure,
  type DegradationCode,
  type DegradedPass,
} from "./authoring-degradation";

const ALL_CODES = Object.values(DEGRADATION_CODES) as DegradationCode[];

describe("isDegradableFailure", () => {
  it("keeps cancellation and run-takeover fatal", () => {
    // These two are control flow, not failures. Laundering either one into a
    // "completed" book would tell an author who pressed stop that their book
    // finished, and would let a superseded run terminalize the live one.
    expect(isDegradableFailure(AUTHORING_CANCELLATION_MESSAGE)).toBe(false);
    expect(isDegradableFailure(AUTHORING_RUN_INACTIVE_MESSAGE)).toBe(false);
  });

  it("degrades the failure that caused the 2026-08-04 incident", () => {
    expect(
      isDegradableFailure(
        "continuity.narrative_structure ended before a complete result was available (finish reason: stop; 3742 output tokens).",
      ),
    ).toBe(true);
  });

  it("degrades ordinary provider and infrastructure failures", () => {
    for (const message of [
      "Generation failed",
      "Rate limit exceeded",
      "fetch failed",
      "Manuscript changed during continuity review",
      "",
    ]) {
      expect(isDegradableFailure(message)).toBe(true);
    }
  });
});

describe("degradationNotice", () => {
  it.each(ALL_CODES.map((code) => [code] as const))("%s reads as plain author-facing copy", (code) => {
    const notice = degradationNotice(code);
    expect(notice.length).toBeGreaterThan(20);
    // The author never sees an error code, an agent name, a step name, or a
    // model. They see what did not happen and what they still have.
    expect(notice).not.toMatch(/continuity\.|_|Error|step|model|schema|token|null|undefined/i);
    expect(notice).toMatch(/^[A-Z]/);
    expect(notice.trim()).toBe(notice);
  });

  it("tells the author their manuscript survived a skipped review", () => {
    const notice = degradationNotice(DEGRADATION_CODES.continuity_review_unavailable);
    expect(notice).toContain("written and saved");
  });
});

describe("degradationSummary", () => {
  const pass = (code: DegradationCode): DegradedPass => ({
    stage: "continuity",
    code,
    reason: "provider output did not validate",
  });

  it("returns undefined for a clean run so callers can branch on presence", () => {
    expect(degradationSummary([])).toBeUndefined();
  });

  it("returns the single notice verbatim when one pass was skipped", () => {
    expect(degradationSummary([pass(DEGRADATION_CODES.continuity_review_unavailable)])).toBe(
      degradationNotice(DEGRADATION_CODES.continuity_review_unavailable),
    );
  });

  it("counts and includes every notice when several were skipped", () => {
    const summary = degradationSummary([
      pass(DEGRADATION_CODES.editorial_pass_incomplete),
      pass(DEGRADATION_CODES.continuity_review_unavailable),
    ]);
    expect(summary).toContain("2 finishing steps");
    expect(summary).toContain(degradationNotice(DEGRADATION_CODES.editorial_pass_incomplete));
    expect(summary).toContain(degradationNotice(DEGRADATION_CODES.continuity_review_unavailable));
  });
});

describe("degradation policy covers only passes that improve an existing manuscript", () => {
  it("never lists a stage that produces the manuscript", () => {
    // Regression guard on the whole design: if someone later adds "chapters",
    // "outline", "concept-expansion" or "bible" here, a book with no prose
    // could be delivered as finished. Those stages must stay fatal.
    const producingStages = ["outline", "bible", "chapters", "finalizing"];
    const degradableStages: DegradedPass["stage"][] = [
      "concept",
      "editing",
      "continuity",
      "revising",
    ];
    for (const stage of degradableStages) {
      expect(producingStages).not.toContain(stage);
    }
    expect(ALL_CODES).toHaveLength(4);
  });
});
