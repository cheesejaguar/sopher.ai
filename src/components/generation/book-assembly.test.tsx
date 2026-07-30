import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BookAssembly } from "./book-assembly";

afterEach(cleanup);

describe("BookAssembly", () => {
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
});
