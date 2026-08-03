// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHelpProvider } from "@/components/studio/studio-help-context";

import { getEditorCoachmarkKind, MobileEditorHeader, StatusBar } from "./status-bar";

const editorState = vi.hoisted(() => ({ selectionEmpty: true }));

vi.mock("@tiptap/react", () => ({
  useEditorState: ({
    selector,
  }: {
    selector: (context: {
      editor: {
        storage: { characterCount: { words: () => number } };
        can: () => { undo: () => boolean; redo: () => boolean };
        state: { selection: { empty: boolean } };
      };
    }) => unknown;
  }) =>
    selector({
      editor: {
        storage: { characterCount: { words: () => 420 } },
        can: () => ({ undo: () => false, redo: () => false }),
        state: { selection: { empty: editorState.selectionEmpty } },
      },
    }),
}));

afterEach(() => {
  cleanup();
  editorState.selectionEmpty = true;
});

function renderStatusBar({
  seenCoachmarks,
  onCoachmarkSeen = vi.fn(),
}: {
  seenCoachmarks: string[];
  onCoachmarkSeen?: (coachmark: string) => void;
}) {
  return render(
    <StudioHelpProvider
      onOpen={vi.fn()}
      seenCoachmarks={seenCoachmarks}
      onCoachmarkSeen={onCoachmarkSeen}
    >
      <StatusBar
        editor={null}
        saveState="saved"
        targetWords={1_000}
        pendingCount={0}
        zen={false}
        onToggleZen={vi.fn()}
      />
    </StudioHelpProvider>,
  );
}

describe("desktop editor guidance", () => {
  it("explains autosave and history nonmodally, then persists dismissal", () => {
    const onCoachmarkSeen = vi.fn();
    renderStatusBar({ seenCoachmarks: [], onCoachmarkSeen });

    expect(
      screen.getByRole("complementary", { name: "Autosave and chapter history" }),
    ).toBeVisible();
    expect(screen.getByText(/use history to review or restore/i)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onCoachmarkSeen).toHaveBeenCalledWith("editor_autosave");
  });

  it("shows selection guidance only after autosave guidance and a real selection", () => {
    expect(
      getEditorCoachmarkKind({
        autosaveVisible: true,
        selectionVisible: true,
        hasSelection: true,
      }),
    ).toBe("autosave");
    expect(
      getEditorCoachmarkKind({
        autosaveVisible: false,
        selectionVisible: true,
        hasSelection: false,
      }),
    ).toBeNull();

    editorState.selectionEmpty = false;
    renderStatusBar({ seenCoachmarks: ["editor_autosave"] });
    expect(
      screen.getByRole("complementary", { name: "Work with the selected passage" }),
    ).toBeVisible();
    expect(screen.getByText(/select prose to open focused rewriting/i)).toBeVisible();
  });
});

describe("mobile editor production status", () => {
  it("shows compact incomplete context without adding a competing action", () => {
    render(
      <StudioHelpProvider
        onOpen={vi.fn()}
        seenCoachmarks={["editor_autosave"]}
        onCoachmarkSeen={vi.fn()}
      >
        <MobileEditorHeader
          chapterNumber={2}
          chapterTitle="The Orchard Below"
          saveState="saved"
          chaptersOpen={false}
          onOpenChapters={vi.fn()}
          productionStatus={{
            label: "Production stopped early",
            detail: "2 of 3 chapters are saved",
          }}
        />
      </StudioHelpProvider>,
    );

    expect(screen.getByLabelText("Incomplete production status")).toHaveTextContent(
      /Production stopped early.*2 of 3 chapters are saved/,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
