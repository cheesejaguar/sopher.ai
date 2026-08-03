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
  it("describes the included story's real one-chapter writing wave", () => {
    render(
      <LiveDraftPane
        chapters={new Map()}
        titles={{}}
        stage="queued"
        experience="trial_short_story"
        subscribeChapterProse={vi.fn(() => () => undefined)}
      />,
    );

    expect(screen.getByText(/one chapter at a time/i)).toBeVisible();
    expect(screen.queryByText(/several chapters at a time/i)).not.toBeInTheDocument();
  });

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

  it("re-subscribes when a drafting chapter crosses the durable saved boundary", () => {
    const unsubscribe = vi.fn();
    const subscribe = vi.fn(() => unsubscribe);
    const { rerender } = render(
      <LiveDraftPane
        chapters={new Map([[1, { status: "drafting" }]])}
        titles={{}}
        stage="chapters"
        subscribeChapterProse={subscribe}
      />,
    );

    rerender(
      <LiveDraftPane
        chapters={new Map([[1, { status: "drafted", wordCount: 142 }]])}
        titles={{}}
        stage="chapters"
        subscribeChapterProse={subscribe}
      />,
    );

    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it("uses safe-stop semantics instead of live drafting semantics during cancellation", () => {
    render(
      <LiveDraftPane
        chapters={new Map([[1, { status: "drafting", wordCount: 123 }]])}
        titles={{ 1: "Night Water" }}
        stage="chapters"
        cancellationRequested
        subscribeChapterProse={vi.fn(() => () => undefined)}
      />,
    );

    expect(screen.getByRole("tablist", { name: "Chapters at the safe stop" })).toBeVisible();
    expect(
      screen.getByRole("tab", { name: "Chapter 1 (finishing at the safe boundary)" }),
    ).toBeVisible();
    expect(screen.getByRole("region", { name: "Chapter 1 saved work" })).toBeVisible();
    expect(screen.getByText("Finishing at the safe boundary.")).toBeVisible();
    expect(screen.getByText("123 words · settling at safe boundary")).toBeVisible();
    expect(screen.queryByRole("tablist", { name: "Drafting chapters" })).not.toBeInTheDocument();
    expect(screen.queryByText(/drafting now/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/123 words · drafting/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Jump to live")).not.toBeInTheDocument();
  });
});
