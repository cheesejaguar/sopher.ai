// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StageTimeline } from "./stage-timeline";

afterEach(cleanup);

describe("StageTimeline", () => {
  it("identifies the active step without relying on colour", () => {
    render(
      <StageTimeline
        stage="chapters"
        pct={42}
        detail="4 of 12 chapters drafted"
        tier="standard"
        draftingCount={2}
        plannedTotal={12}
      />,
    );

    const active = screen.getByText("Chapters").closest('[aria-current="step"]');
    expect(active).toHaveAttribute("data-state", "active");
    expect(active?.querySelector(".forced-colors\\:underline")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Production progress" })).toHaveAttribute(
      "aria-valuenow",
      "42",
    );
  });

  it("keeps a credit pause attached to its actual review phase", () => {
    render(
      <StageTimeline
        stage="awaiting_credits"
        pausedStage="continuity"
        pct={85}
        detail="Credits needed to continue review"
        tier="standard"
        draftingCount={0}
        plannedTotal={12}
      />,
    );

    expect(screen.getByText("Continuity").closest('[aria-current="step"]')).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByRole("progressbar", { name: "Production progress" })).toHaveAttribute(
      "aria-valuetext",
      "85% complete · Stage 6 of 7: Continuity",
    );
  });

  it("does not infer a legacy credit pause phase from an orchestration percentage", () => {
    render(
      <StageTimeline
        stage="awaiting_credits"
        pct={92}
        detail="Credits needed to continue"
        tier="standard"
        draftingCount={0}
        plannedTotal={12}
      />,
    );

    expect(document.querySelector('[aria-current="step"]')).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Production progress" })).toHaveAttribute(
      "aria-valuetext",
      "92% complete · Pipeline preparing",
    );
  });
});
