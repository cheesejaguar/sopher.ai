// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompletionMoment } from "./completion-moment";

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CompletionMoment", () => {
  it("requires explicit confirmation before replacing a completed manuscript", async () => {
    const onWriteAgain = vi.fn();
    render(
      <CompletionMoment
        projectId="project-1"
        projectTitle="The Long Way Home"
        chapterCount={8}
        onWriteAgain={onWriteAgain}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Write again" }));

    expect(onWriteAgain).not.toHaveBeenCalled();
    expect(
      await screen.findByRole("heading", {
        name: "Replace this manuscript with a new draft?",
      }),
    ).toBeVisible();
    expect(screen.getByText(/current chapter prose is saved as a dated snapshot/i)).toBeVisible();
    expect(screen.getByText(/restore their latest archived drafts/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Start new draft" }));
    expect(onWriteAgain).toHaveBeenCalledOnce();
  });

  it("keeps the pending restart control focused and ignores duplicate activation", async () => {
    const onWriteAgain = vi.fn();
    const { rerender } = render(
      <CompletionMoment
        projectId="project-1"
        projectTitle="The Long Way Home"
        chapterCount={8}
        onWriteAgain={onWriteAgain}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Write again" }));
    const start = await screen.findByRole("button", { name: "Start new draft" });
    start.focus();
    fireEvent.click(start);
    expect(onWriteAgain).toHaveBeenCalledOnce();

    rerender(
      <CompletionMoment
        projectId="project-1"
        projectTitle="The Long Way Home"
        chapterCount={8}
        onWriteAgain={onWriteAgain}
        writeAgainPending
      />,
    );

    const pending = screen.getByRole("button", { name: "Starting…" });
    expect(pending).toHaveFocus();
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(pending);
    expect(onWriteAgain).toHaveBeenCalledOnce();
  });

  it("turns an included-story completion into an optional full-book next step", () => {
    render(
      <CompletionMoment
        projectId="trial-project"
        projectTitle="The River Door"
        chapterCount={3}
        experience="trial_short_story"
        onWriteAgain={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Your short story is written." })).toBeVisible();
    expect(screen.getByText(/does not require a card/i)).toBeVisible();
    expect(screen.getByText(/one settled credit purchase permanently unlocks/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Unlock the full-length version" })).toHaveAttribute(
      "href",
      "/studio/credits?return=%2Fstudio%2Fnew%3Ffrom%3Dtrial-project",
    );
    expect(screen.queryByRole("button", { name: "Write again" })).not.toBeInTheDocument();
  });

  it("sends an already-unlocked trial author straight to a new full-length setup", () => {
    render(
      <CompletionMoment
        projectId="trial-project"
        projectTitle="The River Door"
        chapterCount={3}
        experience="trial_short_story"
        fullBookUnlocked
      />,
    );

    expect(screen.getByRole("heading", { name: "Take this story to full length." })).toBeVisible();
    expect(screen.getByText(/title, genre, and brief are ready/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Continue at full length" })).toHaveAttribute(
      "href",
      "/studio/new?from=trial-project",
    );
  });
});
