// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ArchivedChapterRecovery } from "@/db/queries/books";

import { ArchivedChaptersPanel } from "./archived-chapters-panel";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  restore: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/lib/actions/chapters", () => ({
  restoreArchivedChapter: mocks.restore,
}));

const archivedChapter: ArchivedChapterRecovery = {
  chapterId: "11111111-1111-4111-8111-111111111111",
  chapterNumber: 12,
  revisionId: "22222222-2222-4222-8222-222222222222",
  archivedAt: new Date("2026-07-22T17:30:00.000Z"),
  wordCount: 3_412,
  excerpt: "Mara waited until the archive bell stopped ringing before she opened the last door.",
};

beforeEach(() => {
  mocks.push.mockReset();
  mocks.refresh.mockReset();
  mocks.restore.mockReset();
});

afterEach(cleanup);

describe("ArchivedChaptersPanel", () => {
  it("exposes archived metadata and a keyboard-operable prose preview", () => {
    render(<ArchivedChaptersPanel projectId="project-1" chapters={[archivedChapter]} />);

    expect(
      screen.getByRole("heading", { name: "Archived chapters from earlier runs" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Former chapter 12" })).toBeVisible();
    expect(screen.getByText(/3,412 words/)).toBeVisible();

    const time = document.querySelector("time");
    expect(time).toHaveAttribute("datetime", "2026-07-22T17:30:00.000Z");

    const preview = screen.getByText(archivedChapter.excerpt);
    expect(preview).not.toBeVisible();
    fireEvent.click(screen.getByText("Preview archived prose"));
    expect(preview).toBeVisible();

    const restore = screen.getByRole("button", {
      name: "Restore former chapter 12 to the manuscript",
    });
    expect(restore).toHaveAttribute(
      "aria-describedby",
      `archived-chapter-${archivedChapter.chapterId}-metadata`,
    );
  });

  it("announces why restoration is blocked during an active production run", async () => {
    mocks.restore.mockResolvedValue({ ok: false, error: "active_run" });
    render(<ArchivedChaptersPanel projectId="project-1" chapters={[archivedChapter]} />);

    const restore = screen.getByRole("button", {
      name: "Restore former chapter 12 to the manuscript",
    });
    restore.focus();
    fireEvent.click(restore);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Finish or stop the current production run",
    );
    expect(restore).toHaveFocus();
    expect(restore).toHaveAttribute("aria-disabled", "false");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("keeps focus and announces a pending restore without accepting a second action", async () => {
    let finishRestore: ((result: { ok: false; error: "active_run" }) => void) | undefined;
    mocks.restore.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRestore = resolve;
        }),
    );
    render(
      <ArchivedChaptersPanel
        projectId="project-1"
        chapters={[
          archivedChapter,
          {
            ...archivedChapter,
            chapterId: "11111111-1111-4111-8111-111111111112",
            revisionId: "22222222-2222-4222-8222-222222222223",
            chapterNumber: 13,
          },
        ]}
      />,
    );

    const first = screen.getByRole("button", {
      name: "Restore former chapter 12 to the manuscript",
    });
    const second = screen.getByRole("button", {
      name: "Restore former chapter 13 to the manuscript",
    });
    first.focus();
    fireEvent.click(first);
    fireEvent.click(second);

    expect(first).toHaveFocus();
    expect(first).toHaveAttribute("aria-busy", "true");
    expect(first).toHaveAttribute("aria-disabled", "true");
    expect(second).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Restoring former chapter 12");
    expect(mocks.restore).toHaveBeenCalledOnce();

    finishRestore?.({ ok: false, error: "active_run" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Finish or stop the current production run",
    );
  });

  it("opens a restored chapter only after the server confirms recovery", async () => {
    mocks.restore.mockResolvedValue({ ok: true, chapterNumber: 12, version: 8 });
    render(<ArchivedChaptersPanel projectId="project-1" chapters={[archivedChapter]} />);

    fireEvent.click(
      screen.getByRole("button", {
        name: "Restore former chapter 12 to the manuscript",
      }),
    );

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/projects/project-1/editor/12"));
    expect(screen.getByRole("status")).toHaveTextContent("Former chapter 12 restored");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
