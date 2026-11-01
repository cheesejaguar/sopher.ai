// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChapterSidebar } from "./chapter-sidebar";

const push = vi.fn();

// The router is Next's runtime, not ours; the folio rail and chapter menus
// render for real so the test exercises the actual navigation wiring.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

describe("ChapterSidebar manuscript review navigation", () => {
  it("preserves the validated review set across desktop and folio chapter links", () => {
    render(
      <ChapterSidebar
        projectId="project-1"
        bookTitle="The Crossing"
        activeChapterNumber={1}
        reviewRunId="22222222-2222-4222-8222-222222222222"
        chapters={[
          {
            id: "chapter-1",
            chapterNumber: 1,
            title: "Departure",
            wordCount: 900,
            status: "drafted",
          },
          {
            id: "chapter-2",
            chapterNumber: 2,
            title: "Crossing",
            wordCount: 1_100,
            status: "edited",
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: /2\. crossing/i })).toHaveAttribute(
      "href",
      "/projects/project-1/editor/2?suggestions=1&reviewRun=22222222-2222-4222-8222-222222222222",
    );
    expect(screen.getByRole("link", { name: "All chapters" })).toHaveAttribute(
      "href",
      "/projects/project-1/editor",
    );

    fireEvent.click(screen.getByRole("option", { name: "Chapter 2 · edited" }));
    expect(push).toHaveBeenCalledWith(
      "/projects/project-1/editor/2?suggestions=1&reviewRun=22222222-2222-4222-8222-222222222222",
    );
  });
});
