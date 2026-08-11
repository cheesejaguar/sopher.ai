import { describe, expect, it } from "vitest";

import { providerReviewProducedOnlyRejectedSuggestions } from "./manuscript-review-normalization";

const diagnostics = {
  receivedCount: 0,
  acceptedCount: 0,
  noOpCount: 0,
  invalidCount: 0,
  truncatedCount: 0,
};

describe("providerReviewProducedOnlyRejectedSuggestions", () => {
  it("separates all-no-op output from a genuinely empty review", () => {
    expect(
      providerReviewProducedOnlyRejectedSuggestions(
        { ...diagnostics, receivedCount: 2, noOpCount: 2 },
        0,
      ),
    ).toBe(true);
    expect(providerReviewProducedOnlyRejectedSuggestions(diagnostics, 0)).toBe(false);
  });

  it("does not reject a review that retained an actionable suggestion", () => {
    expect(
      providerReviewProducedOnlyRejectedSuggestions(
        { ...diagnostics, receivedCount: 2, acceptedCount: 1, noOpCount: 1 },
        1,
      ),
    ).toBe(false);
  });
});
