// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { BibleEntity } from "@/db/queries/entities";

import { EntityCanonDialog } from "./entity-canon-dialog";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  createEntity: vi.fn(),
  updateEntity: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/lib/actions/entities", () => ({
  createBibleEntity: mocks.createEntity,
  updateBibleEntity: mocks.updateEntity,
}));

const character: BibleEntity = {
  id: "66666666-6666-4666-8666-666666666661",
  kind: "character",
  name: "Mara Vale",
  aliases: ["Mara"],
  attrs: {
    appearance: "Short, wiry, and sure-footed",
    background: "Raised among Bellweather's public clocks",
    goals: ["Restore the missing river quarter"],
    personality: ["observant", "stubborn"],
    speech: "Spare, exact sentences",
    arc: "Becomes the deliberate author of her own work",
    facts: ["The brass compass responds to her touch"],
  },
  portraitUrl: null,
  firstAppearanceChapter: 1,
  relationships: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createEntity.mockResolvedValue({ ok: true, entityId: "new-entity" });
  mocks.updateEntity.mockResolvedValue({ ok: true, entityId: character.id });
});

afterEach(() => cleanup());

describe("EntityCanonDialog", () => {
  it("edits the complete character canon and announces a successful save", async () => {
    render(<EntityCanonDialog projectId="project-1" entity={character} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit canon" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Physical appearance")).toHaveValue(
      "Short, wiry, and sure-footed",
    );
    expect(within(dialog).getByLabelText("Voice")).toHaveValue("Spare, exact sentences");

    fireEvent.change(within(dialog).getByLabelText("Canon name"), {
      target: { value: "Mara Vales" },
    });
    fireEvent.change(within(dialog).getByLabelText("Goals"), {
      target: { value: "Restore the river quarter\nProtect the observatory" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save canon" }));

    await waitFor(() =>
      expect(mocks.updateEntity).toHaveBeenCalledWith(
        "project-1",
        character.id,
        expect.objectContaining({
          kind: "character",
          name: "Mara Vales",
          aliases: ["Mara"],
          goals: ["Restore the river quarter", "Protect the observatory"],
          voice: "Spare, exact sentences",
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("status")).toHaveTextContent("Mara Vales canon saved");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps author input visible when an active run rejects the save", async () => {
    mocks.updateEntity.mockResolvedValue({
      ok: false,
      error: "active_run",
      message: "Finish or stop the current authoring run before changing story canon.",
    });
    render(<EntityCanonDialog projectId="project-1" entity={character} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit canon" }));

    const dialog = await screen.findByRole("dialog");
    const background = within(dialog).getByLabelText("Background");
    fireEvent.change(background, { target: { value: "A corrected history" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save canon" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Finish or stop");
    expect(background).toHaveValue("A corrected history");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("adds a place with kind-specific language and newline-delimited facts", async () => {
    render(<EntityCanonDialog projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Add entry" }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: /Place:/ }));
    expect(within(dialog).getByLabelText("Appearance and layout")).toBeVisible();

    fireEvent.change(within(dialog).getByLabelText("Canon name"), {
      target: { value: "Bellweather Observatory" },
    });
    fireEvent.change(within(dialog).getByLabelText("Appearance and layout"), {
      target: { value: "A sealed copper dome above the river quarter" },
    });
    fireEvent.change(within(dialog).getByLabelText("Established facts"), {
      target: { value: "The western door is sealed\nThe dome opens at midnight" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add to Story Bible" }));

    await waitFor(() =>
      expect(mocks.createEntity).toHaveBeenCalledWith(
        "project-1",
        expect.objectContaining({
          kind: "location",
          name: "Bellweather Observatory",
          appearance: "A sealed copper dome above the river quarter",
          facts: ["The western door is sealed", "The dome opens at midnight"],
        }),
      ),
    );
  });

  it("keeps read-only controls discoverable and explains the active-run lock", () => {
    render(
      <EntityCanonDialog
        projectId="project-1"
        entity={character}
        readOnlyReason="Finish or stop the current run to edit canon."
      />,
    );

    const button = screen.getByRole("button", {
      name: "Edit canon",
      description: "Finish or stop the current run to edit canon.",
    });
    expect(button).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(button);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
