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
    expect(isDegradableFailure(new Error(AUTHORING_CANCELLATION_MESSAGE))).toBe(false);
    expect(isDegradableFailure(new Error(AUTHORING_RUN_INACTIVE_MESSAGE))).toBe(false);
  });

  it("degrades the failure that caused the 2026-08-04 incident", () => {
    expect(
      isDegradableFailure(
        new Error(
          "continuity.narrative_structure ended before a complete result was available (finish reason: stop; 3742 output tokens).",
        ),
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
      expect(isDegradableFailure(new Error(message))).toBe(true);
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

describe("failures that must never be absorbed", () => {
  it.each([
    [
      "unresolved metering",
      "A prior provider attempt has unresolved local metering. The call was not repeated; reconciliation is required.",
    ],
    [
      "settled call with a missing output",
      "This logical provider call was already settled but its output checkpoint is missing. The call was not repeated.",
    ],
  ])("keeps %s fatal so the run terminalizes", (_label, message) => {
    // Completion is the one state the reconciliation machinery cannot see: the
    // unresolved-metering sweep only looks at failed and cancelled runs, the
    // incident row is only written on the failed transition, and the admin
    // reconcile action is only offered for a failed run. Absorbing this would
    // leave a credit hold against the author with the run reading as success.
    expect(isDegradableFailure(new Error(message))).toBe(false);
  });

  it("stays fatal when the metering failure arrives as a structured-clone object", () => {
    // The production shape: a step error crossing the Workflow boundary is a
    // plain object, not an Error instance.
    expect(
      isDegradableFailure({
        name: "FatalError",
        message:
          "A prior provider attempt has unresolved local metering. The call was not repeated; reconciliation is required.",
      }),
    ).toBe(false);
  });

  it("stays fatal when cancellation is only in the cause chain", () => {
    expect(
      isDegradableFailure(
        new Error("Chapter wave 2 failed", {
          cause: new Error(AUTHORING_CANCELLATION_MESSAGE),
        }),
      ),
    ).toBe(false);
  });

  it("still degrades the failure the incident was actually about", () => {
    expect(
      isDegradableFailure(
        new Error(
          "continuity.narrative_structure ended before a complete result was available (finish reason: stop; 3742 output tokens).",
        ),
      ),
    ).toBe(true);
  });
});

describe("degradation policy stays limited to passes that only polish", () => {
  it("names a distinct code for a partial review versus no review at all", () => {
    // A partial review has real findings but no trustworthy score; telling the
    // author "the review is missing" while showing them a score is worse than
    // either message alone.
    expect(DEGRADATION_CODES.continuity_review_partial).not.toBe(
      DEGRADATION_CODES.continuity_review_unavailable,
    );
    expect(degradationNotice(DEGRADATION_CODES.continuity_review_partial)).toContain(
      "no overall score",
    );
  });

  it("covers exactly the five polish passes and no manuscript-producing stage", () => {
    // If someone later adds "chapters", "outline" or "bible" here, a book with
    // missing prose could be delivered as finished.
    expect(new Set(Object.keys(DEGRADATION_CODES))).toEqual(
      new Set([
        "creative_question_unavailable",
        "editorial_pass_incomplete",
        "continuity_review_unavailable",
        "continuity_review_partial",
        "continuity_revision_skipped",
      ]),
    );
  });
});
