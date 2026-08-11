// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SuggestionCard } from "./suggestion-card";

describe("SuggestionCard passage diff", () => {
  it("preserves paragraph boundaries in labeled original and proposed passages", () => {
    const { container } = render(
      <SuggestionCard
        suggestion={{
          id: "suggestion-1",
          chapterId: "chapter-1",
          runId: "run-1",
          chapterVersion: 1,
          passType: "review",
          suggestionType: "structure",
          severity: "info",
          anchor: {
            start: 0,
            end: 29,
            originalText: "First paragraph.\n\nSecond paragraph.",
          },
          suggestedText: "First paragraph.\nSecond paragraph revised.",
          explanation: "Join the beat while revising its turn.",
          status: "pending",
        }}
        busy={false}
        onAccept={vi.fn()}
        onAcceptEdited={vi.fn()}
        onReject={vi.fn()}
        onDismiss={vi.fn()}
        touchFriendly
      />,
    );

    expect(screen.getByText("Original passage")).toBeVisible();
    expect(screen.getByText("Proposed passage")).toBeVisible();
    const removed = container.querySelector("del");
    const inserted = container.querySelector("ins");
    expect(removed).toHaveTextContent("First paragraph. Second paragraph.");
    expect(removed).toHaveClass("whitespace-pre-wrap");
    expect(removed?.textContent).toContain("\n\n");
    expect(inserted).toHaveClass("whitespace-pre-wrap");
    expect(inserted?.textContent).toContain("\nSecond paragraph revised.");
  });
});
