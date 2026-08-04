// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { skippedPassNotices, SkippedPassesNotice } from "./skipped-passes";
import { DEGRADATION_CODES, degradationNotice } from "@/lib/authoring-degradation";

/** The shape `finalizeStep` writes to `config.completion.degraded`. */
function persisted(code: string, reason: string) {
  return { stage: "continuity" as const, code, reason, at: "2026-08-04T04:00:00.000Z" };
}

afterEach(cleanup);

describe("skippedPassNotices", () => {
  it("is empty for a clean run", () => {
    expect(skippedPassNotices(undefined)).toEqual([]);
    expect(skippedPassNotices([])).toEqual([]);
  });

  it("turns a persisted code into the author-facing notice", () => {
    expect(
      skippedPassNotices([
        persisted(
          DEGRADATION_CODES.continuity_review_unavailable,
          "continuity.narrative_structure could not produce a report",
        ),
      ]),
    ).toEqual([degradationNotice(DEGRADATION_CODES.continuity_review_unavailable)]);
  });

  it("drops a code it has no author copy for rather than inventing one", () => {
    expect(skippedPassNotices([persisted("some_future_pass_failed", "operator detail")])).toEqual(
      [],
    );
  });

  it("does not treat inherited object keys as degradation codes", () => {
    expect(skippedPassNotices([persisted("toString", "operator detail")])).toEqual([]);
    expect(skippedPassNotices([persisted("constructor", "operator detail")])).toEqual([]);
  });

  it("says one caveat once even when several chapters missed the same pass", () => {
    const notices = skippedPassNotices([
      persisted(DEGRADATION_CODES.editorial_pass_incomplete, "chapter 3"),
      persisted(DEGRADATION_CODES.editorial_pass_incomplete, "chapter 7"),
      persisted(DEGRADATION_CODES.continuity_review_unavailable, "no report"),
    ]);
    expect(notices).toEqual([
      degradationNotice(DEGRADATION_CODES.editorial_pass_incomplete),
      degradationNotice(DEGRADATION_CODES.continuity_review_unavailable),
    ]);
  });
});

describe("SkippedPassesNotice", () => {
  it("renders nothing when the run was clean", () => {
    const { container } = render(<SkippedPassesNotice notices={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("tells an author who never saw the live stream what their book did not get", () => {
    const notices = skippedPassNotices([
      persisted(
        DEGRADATION_CODES.continuity_review_unavailable,
        "continuity.narrative_structure could not produce a report",
      ),
    ]);
    render(<SkippedPassesNotice notices={notices} />);

    expect(
      screen.getByText("One finishing pass was skipped so your book could be delivered."),
    ).toBeVisible();
    expect(
      screen.getByText(degradationNotice(DEGRADATION_CODES.continuity_review_unavailable)),
    ).toBeVisible();
    // The operator reason names a step; it belongs in the run row, not on the
    // page an author reads their book on.
    expect(screen.queryByText(/narrative_structure/)).not.toBeInTheDocument();
  });

  it("counts the caveats when more than one pass was skipped", () => {
    render(
      <SkippedPassesNotice
        notices={skippedPassNotices([
          persisted(DEGRADATION_CODES.editorial_pass_incomplete, "chapter 3"),
          persisted(DEGRADATION_CODES.continuity_review_unavailable, "no report"),
        ])}
      />,
    );

    expect(
      screen.getByText("2 finishing passes were skipped so your book could be delivered."),
    ).toBeVisible();
  });

  it("uses the ember warning role, not the destructive one — the book is finished", () => {
    const { container } = render(
      <SkippedPassesNotice
        notices={[degradationNotice(DEGRADATION_CODES.continuity_review_unavailable)]}
      />,
    );

    const strip = container.querySelector("section");
    expect(strip?.className).toContain("border-ember/40");
    expect(strip?.className).toContain("bg-ember/8");
    expect(strip?.className).not.toMatch(/destructive/);
  });
});
