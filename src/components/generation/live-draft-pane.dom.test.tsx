// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ChapterProgress } from "@/hooks/use-run-stream";

import { LiveDraftPane } from "./live-draft-pane";

afterEach(cleanup);

function chapters(count: number): Map<number, ChapterProgress> {
  return new Map(
    Array.from({ length: count }, (_, index) => [
      index + 1,
      { status: index + 1 === count ? ("drafting" as const) : ("drafted" as const) },
    ]),
  );
}

describe("LiveDraftPane focus retention", () => {
  it("keeps an initially active focused tab mounted when a seventh chapter arrives", () => {
    const subscribe = vi.fn(() => () => undefined);
    const { rerender } = render(
      <LiveDraftPane
        chapters={chapters(6)}
        titles={{}}
        stage="chapters"
        subscribeChapterProse={subscribe}
      />,
    );

    const fourth = screen.getByRole("tab", { name: "Chapter 4" });
    fireEvent.click(fourth);

    const first = screen.getByRole("tab", { name: "Chapter 1" });
    first.focus();
    expect(first).toHaveFocus();

    rerender(
      <LiveDraftPane
        chapters={chapters(7)}
        titles={{}}
        stage="chapters"
        subscribeChapterProse={subscribe}
      />,
    );

    expect(screen.getByRole("tab", { name: "Chapter 1" })).toBe(first);
    expect(first).toHaveFocus();
    expect(screen.getAllByRole("tab")).toHaveLength(6);
  });
});
