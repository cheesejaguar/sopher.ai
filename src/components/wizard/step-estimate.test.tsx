// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { initialWizardState } from "./wizard-state";
import { StepEstimate, type WizardQuoteSummary } from "./step-estimate";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StepEstimate", () => {
  it("offers collaborative participation by default and lets the author choose autopilot", () => {
    const dispatch = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<StepEstimate state={initialWizardState} dispatch={dispatch} />);

    expect(screen.getByRole("radio", { name: /collaborative/i })).toBeChecked();
    expect(screen.getByText("Recommended")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: /autopilot/i }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "patch",
      patch: { authoringMode: "autopilot" },
    });
  });

  it("invalidates the prior receipt when a changed shape cannot be quoted", async () => {
    const onQuote = vi.fn<(quote: WizardQuoteSummary | null) => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const payload = JSON.parse(String(init?.body)) as { chapters: number };
        if (payload.chapters !== 12) {
          return {
            ok: false,
            json: async () => ({ error: "That shape could not be quoted." }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            tiers: [
              {
                tier: "standard",
                totalUsd: 0.6,
                credits: 1.7,
                balance: 10,
                estimatedMinutes: 12,
                stages: [{ stage: "Concept", usd: 0.1 }],
              },
            ],
          }),
        };
      }),
    );

    const { rerender } = render(
      <StepEstimate state={initialWizardState} dispatch={vi.fn()} onQuote={onQuote} />,
    );

    expect(await screen.findByText("Estimated production time: ~12 min")).toBeVisible();
    await waitFor(() =>
      expect(onQuote).toHaveBeenLastCalledWith(
        expect.objectContaining({
          chapters: 12,
          wordsPerChapter: 3_000,
          tier: "standard",
        }),
      ),
    );

    rerender(
      <StepEstimate
        state={{ ...initialWizardState, chapters: 13 }}
        dispatch={vi.fn()}
        onQuote={onQuote}
      />,
    );

    expect(screen.queryByText("Estimated production time: ~12 min")).not.toBeInTheDocument();
    expect(screen.queryByText("1.7 cr")).not.toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("That shape could not be quoted.");
    await waitFor(() => expect(onQuote).toHaveBeenLastCalledWith(null));
  });
});
