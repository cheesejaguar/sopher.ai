import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BookAssembly } from "./book-assembly";

afterEach(cleanup);

describe("BookAssembly", () => {
  it("keeps automatic assembly motion finite", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const pageRule = css.match(/\.production-book-page-active\s*\{([^}]*)\}/)?.[1];
    const scanRule = css.match(/\.production-review-beam\s*\{([^}]*)\}/)?.[1];
    const caretRule = css.match(/\.stream-caret::after\s*\{([^}]*)\}/)?.[1];

    expect(pageRule).toContain("2.4s cubic-bezier(0.22, 1, 0.36, 1) 1 both");
    expect(scanRule).toContain("2.2s cubic-bezier(0.22, 1, 0.36, 1) 1 both");
    expect(caretRule).toContain("caret-blink 1.1s steps(1) 4");
    expect(pageRule).not.toContain("infinite");
    expect(scanRule).not.toContain("infinite");
    expect(caretRule).not.toContain("infinite");
  });

  it("renders the complete frozen chapter plan before every chapter has emitted an event", () => {
    render(
      <BookAssembly
        chapters={
          new Map([
            [1, { status: "drafted", wordCount: 2_013 }],
            [2, { status: "drafting" }],
          ])
        }
        titles={{ 1: "The Crossing", 2: "Night Water" }}
        plannedTotal={5}
        targetWordsPerChapter={2_000}
        stage="chapters"
      />,
    );

    const assembly = screen.getByRole("list", { name: "5-chapter manuscript assembly" });
    expect(within(assembly).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByLabelText("Chapter 1, The Crossing: assembled")).toBeTruthy();
    expect(screen.getByLabelText("Chapter 2, Night Water: being written")).toBeTruthy();
    expect(screen.getByLabelText("Chapter 2, Night Water: being written").className).not.toContain(
      "animate-pulse",
    );
    expect(screen.getByLabelText("Chapter 5: planned")).toBeTruthy();
    expect(screen.getByText("Run plan: 5 chapters × ~2,000 words")).toBeTruthy();
  });

  it("only marks chapters final when final state exists", () => {
    render(
      <BookAssembly
        chapters={
          new Map([
            [1, { status: "final" }],
            [2, { status: "edited" }],
            [3, { status: "drafted" }],
          ])
        }
        titles={{}}
        plannedTotal={4}
        targetWordsPerChapter={3_000}
        stage="finalizing"
      />,
    );

    expect(screen.getByLabelText("Chapter 1: final")).toBeTruthy();
    expect(screen.getByLabelText("Chapter 2: reviewed")).toBeTruthy();
    expect(screen.getByLabelText("Chapter 3: assembled")).toBeTruthy();
    expect(screen.getByLabelText("Chapter 4: planned")).toBeTruthy();
  });

  it("keeps the assembly artifact active while an accepted run is preparing", () => {
    const { container } = render(
      <BookAssembly
        chapters={new Map()}
        titles={{}}
        plannedTotal={3}
        targetWordsPerChapter={1_000}
        stage="queued"
      />,
    );

    expect(container.querySelector(".production-book-page-active")).not.toBeNull();
    expect(
      screen.getByText(/writing team is being assigned|production desk is ready/i),
    ).toBeTruthy();
  });
});
