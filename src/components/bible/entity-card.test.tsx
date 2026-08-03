// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import type { BibleEntity } from "@/db/queries/entities";

import { EntityCard } from "./entity-card";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  settleIssue: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/actions/continuity", () => ({
  setContinuityIssueStatus: mocks.settleIssue,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const character: BibleEntity = {
  id: "66666666-6666-4666-8666-666666666661",
  kind: "character",
  name: "Mara Vale",
  aliases: ["Mara"],
  attrs: {
    role: "protagonist",
    background: "Raised among Bellweather's public clocks.",
    occupation: "apprentice clockmaker",
    age: "31",
    heritage: "Bellweather canal district",
    arc: "Becomes the deliberate author of her own work.",
    nameRationale: "She carries her grandfather's workshop name.",
    appearance: "Weathered and compact, with a steady surveying gaze.",
    build: "Short, wiry, and sure-footed",
    face: "Angular face with a cleft chin",
    hair: "Black curls cut at the jaw",
    eyes: "Grey-green, narrow-set",
    complexion: "Warm brown with wind-reddened cheeks",
    distinguishingFeatures: ["rope scar across her right palm"],
    wardrobe: "Waxed indigo coat and salt-stained boots",
    posture: "Weight pitched forward as if walking into wind",
    speech: "Spare, exact sentences",
    personality: ["observant", "stubborn"],
    mannerisms: ["checks the horizon before answering"],
    goals: ["restore the missing river quarter"],
    fears: ["repeating her grandfather's disappearance"],
    secrets: ["she altered her final survey"],
    facts: ["The brass compass responds to her touch."],
  },
  portraitUrl: "/portrait-mara.png",
  firstAppearanceChapter: 1,
  relationships: [
    {
      type: "owns",
      other: "Brass Compass",
      description: "Mara inherits and carries the compass her grandfather left behind.",
    },
  ],
};

const location: BibleEntity = {
  id: "66666666-6666-4666-8666-666666666662",
  kind: "location",
  name: "Bellweather Observatory",
  aliases: [],
  attrs: {
    locationType: "observatory",
    description: "A sealed observatory above the river quarter.",
  },
  portraitUrl: null,
  firstAppearanceChapter: 2,
  relationships: [],
};

const object: BibleEntity = {
  id: "66666666-6666-4666-8666-666666666663",
  kind: "object",
  name: "Brass Compass",
  aliases: [],
  attrs: {
    description: "A compass whose needle points through time.",
  },
  portraitUrl: null,
  firstAppearanceChapter: 1,
  relationships: [],
};

describe("EntityCard", () => {
  it("presents a sectioned profile and relationship context", () => {
    render(<EntityCard entity={character} conflicts={[]} />);

    expect(screen.getByRole("heading", { name: "Place in the story" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Physical canon" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Voice and inner life" })).toBeTruthy();
    expect(screen.getByText("Waxed indigo coat and salt-stained boots")).toBeTruthy();
    expect(
      screen.getByText("Mara inherits and carries the compass her grandfather left behind."),
    ).toBeTruthy();
  });

  it("names generated-image actions for the entity kind", () => {
    const locationCard = render(<EntityCard entity={location} conflicts={[]} />);
    expect(screen.getByRole("button", { name: /Generate location image/ })).toBeVisible();
    locationCard.unmount();

    render(<EntityCard entity={object} conflicts={[]} />);
    expect(screen.getByRole("button", { name: /Generate object illustration/ })).toBeVisible();
  });

  it("opens the full image with a named control, closes on Escape, and restores focus", async () => {
    render(<EntityCard entity={character} conflicts={[]} />);

    const trigger = screen.getByRole("button", { name: "View full image of Mara Vale" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Visual canon: Weathered and compact/)).toBeTruthy();
    expect(within(dialog).queryByRole("img")).toBeNull();
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("announces portrait-generation failures without discarding the profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "The image model returned no image" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(<EntityCard entity={{ ...character, portraitUrl: null }} conflicts={[]} />);

    const generate = screen.getByRole("button", { name: /Generate portrait/ });
    generate.focus();
    fireEvent.click(generate);

    expect(await screen.findByRole("alert")).toHaveTextContent("The image model returned no image");
    expect(generate).toHaveFocus();
    expect(generate).toHaveAttribute("aria-disabled", "false");
    expect(screen.getByRole("heading", { name: "Physical canon" })).toBeTruthy();
  });

  it("announces portrait work and keeps the pending control focused", async () => {
    let finishRequest: ((response: Response) => void) | undefined;
    const request = new Promise<Response>((resolve) => {
      finishRequest = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(request));
    render(<EntityCard entity={{ ...character, portraitUrl: null }} conflicts={[]} />);

    const generate = screen.getByRole("button", { name: /Generate portrait/ });
    generate.focus();
    fireEvent.click(generate);

    expect(generate).toHaveFocus();
    expect(generate).toHaveAttribute("aria-disabled", "true");
    expect(generate).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Generating portrait for Mara Vale");

    finishRequest?.(
      new Response(JSON.stringify({ url: "/portrait-mara-new.png" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    await screen.findByRole("button", { name: "View full image of Mara Vale" });
  });

  it("announces a generated portrait and moves focus to its full-image control", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ url: "/portrait-mara-new.png" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    render(<EntityCard entity={{ ...character, portraitUrl: null }} conflicts={[]} />);

    const generate = screen.getByRole("button", { name: /Generate portrait/ });
    generate.focus();
    fireEvent.click(generate);

    expect(await screen.findByRole("status")).toHaveTextContent("Portrait ready for Mara Vale");
    const imageTrigger = await screen.findByRole("button", {
      name: "View full image of Mara Vale",
    });
    await waitFor(() => expect(imageTrigger).toHaveFocus());
  });

  it("announces conflict work and moves focus before refreshing a resolved conflict", async () => {
    let finishAction: (() => void) | undefined;
    mocks.settleIssue.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishAction = resolve;
        }),
    );
    render(
      <EntityCard
        entity={character}
        conflicts={[
          {
            id: "conflict-1",
            severity: "high",
            description: "Mara's coat changes colour.",
          },
        ]}
      />,
    );

    const resolve = screen.getByRole("button", { name: "Mark resolved" });
    resolve.focus();
    fireEvent.click(resolve);

    expect(resolve).toHaveFocus();
    expect(resolve).toHaveAttribute("aria-disabled", "true");
    expect(resolve).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Marking conflict as resolved");

    finishAction?.();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Conflict marked resolved for Mara Vale",
      ),
    );
    expect(screen.getByRole("heading", { name: "Mara Vale" })).toHaveFocus();
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
