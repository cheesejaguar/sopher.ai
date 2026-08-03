// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioAccess } from "@/lib/studio-access";
import { FULL_BOOK_UNLOCK_HREF, fullBookUnlockHref } from "@/lib/marketing/trial-offer";

import { NewBookWizard } from "./new-book-wizard";
import {
  initialWizardState,
  serializeDraft,
  wizardDraftKey,
  wizardRequestKey,
} from "./wizard-state";

const { openUserProfile } = vi.hoisted(() => ({ openUserProfile: vi.fn() }));
const replace = vi.fn();
const refresh = vi.fn();
const startBook = vi.fn();
const track = vi.fn();
const localValues = new Map<string, string>();
const localStorageMock: Storage = {
  get length() {
    return localValues.size;
  },
  clear: () => localValues.clear(),
  getItem: (key) => localValues.get(key) ?? null,
  key: (index) => [...localValues.keys()][index] ?? null,
  removeItem: (key) => {
    localValues.delete(key);
  },
  setItem: (key, value) => {
    localValues.set(key, String(value));
  },
};

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ openUserProfile }),
}));

vi.mock("@/lib/actions/projects", () => ({
  startBook: (...args: unknown[]) => startBook(...args),
}));

vi.mock("@/lib/analytics/track", () => ({
  track: (...args: unknown[]) => track(...args),
}));

const fullBookAccess: StudioAccess = {
  emailVerified: true,
  isAdmin: false,
  suspended: false,
  hasSettledPurchase: true,
  hasPriorMeteredUsage: false,
  fullBookUnlocked: true,
  trialProjectId: null,
  trialProjectCompleted: false,
  canCreateTrial: false,
  creationExperience: "full_book",
  reason: "full_book_unlocked",
};

const trialAccess: StudioAccess = {
  emailVerified: true,
  isAdmin: false,
  suspended: false,
  hasSettledPurchase: false,
  hasPriorMeteredUsage: false,
  fullBookUnlocked: false,
  trialProjectId: null,
  trialProjectCompleted: false,
  canCreateTrial: true,
  creationExperience: "trial_short_story",
  reason: "trial_available",
};

const existingTrialAccess: StudioAccess = {
  emailVerified: true,
  isAdmin: false,
  suspended: false,
  hasSettledPurchase: false,
  hasPriorMeteredUsage: false,
  fullBookUnlocked: false,
  trialProjectId: "trial-project-1",
  trialProjectCompleted: false,
  canCreateTrial: false,
  creationExperience: null,
  reason: "trial_exists",
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: localStorageMock,
  });
  window.localStorage.clear();
  replace.mockReset();
  refresh.mockReset();
  openUserProfile.mockReset();
  startBook.mockReset();
  track.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function mockEstimate(balance = 10) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tiers: [
          {
            tier: "standard",
            totalUsd: 0.6,
            credits: 1.7,
            balance,
            estimatedMinutes: 12,
            stages: [{ stage: "Concept", usd: 0.1 }],
          },
        ],
      }),
    })),
  );
}

async function completeFullBookSetup(
  userId: string,
  options: { e2eStartMode?: "fail_before_work" } = {},
) {
  render(
    <NewBookWizard
      initialGenre="mystery"
      userId={userId}
      access={fullBookAccess}
      e2eStartMode={options.e2eStartMode}
    />,
  );
  await screen.findByText("Step 01 / 04");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.change(screen.getByLabelText("Working title"), {
    target: { value: "The Quiet Key" },
  });
  fireEvent.change(screen.getByLabelText("Your brief"), {
    target: { value: "A locksmith finds a key that opens a room erased from every map." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  const start = await screen.findByRole("button", { name: "Start the book" });
  await waitFor(() => expect(start).not.toHaveAttribute("aria-disabled", "true"));
}

describe("NewBookWizard", () => {
  it("keeps a preselected genre on Step 1", async () => {
    render(<NewBookWizard initialGenre="fantasy" userId="user-1" access={fullBookAccess} />);

    expect(
      await screen.findByRole("heading", { name: /pick the shelf it belongs on/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("complementary", { name: "Book setup progress and summary" }),
    ).toBeVisible();
    expect(screen.getByText("Step 01 / 04")).toBeVisible();
    expect(screen.getByText("Fantasy").closest("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("carries an owned included story into a separate full-length setup on Step 1", async () => {
    render(
      <NewBookWizard
        userId="user-carried"
        access={fullBookAccess}
        initialSetup={{
          title: "The River Door",
          genre: "fantasy",
          brief: "A cartographer finds a river that remembers every traveler it has carried.",
        }}
      />,
    );

    expect(await screen.findByText("Your included story is carried forward.")).toBeVisible();
    expect(screen.getByText(/separate full-length production/i)).toBeVisible();
    // One responsive summary for desktop and one inside the mobile disclosure.
    const quoteLabels = screen.getAllByText("Current quote");
    expect(quoteLabels).toHaveLength(2);
    for (const quoteLabel of quoteLabels) {
      const summary = quoteLabel.closest("dl");
      expect(summary).not.toBeNull();
      for (const group of Array.from(summary!.children)) {
        expect(Array.from(group.children, (child) => child.tagName)).toEqual(["DT", "DD"]);
      }
    }
    expect(screen.getByText("Step 01 / 04")).toBeVisible();
    expect(screen.getByText("Fantasy").closest("button")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByLabelText("Working title")).toHaveValue("The River Door");
    expect(screen.getByLabelText("Your brief")).toHaveValue(
      "A cartographer finds a river that remembers every traveler it has carried.",
    );
  });

  it("submits the carried title and brief as a fresh full-book production", async () => {
    mockEstimate();
    startBook.mockResolvedValue({
      status: "accepted",
      projectId: "new-full-book-project",
      runId: "new-full-book-run",
      experience: "full_book",
    });
    render(
      <NewBookWizard
        userId="user-carried-submit"
        access={fullBookAccess}
        initialSetup={{
          title: "The River Door",
          genre: "fantasy",
          brief: "A cartographer finds a river that remembers every traveler it has carried.",
        }}
      />,
    );

    await screen.findByText("Step 01 / 04");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    const start = await screen.findByRole("button", { name: "Start the book" });
    await waitFor(() => expect(start).not.toHaveAttribute("aria-disabled", "true"));
    fireEvent.click(start);

    await waitFor(() =>
      expect(startBook).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "The River Door",
          genre: "fantasy",
          brief: "A cartographer finds a river that remembers every traveler it has carried.",
          targetChapters: 12,
          targetWordsPerChapter: 3_000,
          settings: expect.objectContaining({ authoringMode: "guided" }),
        }),
      ),
    );
    expect(replace).toHaveBeenCalledWith("/projects/new-full-book-project/write");
  });

  it("keeps the full-length upsell out of an unfinished included story", () => {
    render(<NewBookWizard userId="user-gated" access={existingTrialAccess} />);

    expect(
      screen.getByRole("heading", { name: "Your included story is already in Studio" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Open my included story" })).toHaveAttribute(
      "href",
      "/projects/trial-project-1/write",
    );
    expect(
      screen.queryByRole("link", { name: "Take this story to full length" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/does not require a card/i)).toBeVisible();
    expect(screen.queryByText("Step 01 / 04")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Chapters")).not.toBeInTheDocument();
  });

  it("offers full-length continuation after the included story is complete", () => {
    render(
      <NewBookWizard
        userId="user-gated-complete"
        access={{ ...existingTrialAccess, trialProjectCompleted: true }}
      />,
    );

    expect(screen.getByRole("link", { name: "Take this story to full length" })).toHaveAttribute(
      "href",
      fullBookUnlockHref("trial-project-1"),
    );
  });

  it("keeps verification and purchase-required gates explicit", () => {
    const { rerender } = render(
      <NewBookWizard
        userId="user-unverified"
        access={{
          ...existingTrialAccess,
          emailVerified: false,
          trialProjectId: null,
          reason: "verify_email",
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: "Verify your email to begin" })).toBeVisible();
    expect(screen.getByText(/no purchase required/i)).toBeVisible();
    expect(screen.getByText(/local preview cannot open hosted email settings/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Check verification again" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Return to Studio" })).not.toBeInTheDocument();

    rerender(
      <NewBookWizard
        userId="user-legacy"
        access={{
          ...existingTrialAccess,
          hasPriorMeteredUsage: true,
          trialProjectId: null,
          reason: "purchase_required",
        }}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Unlock your next full-length book" }),
    ).toBeVisible();
    expect(screen.getByText(/permanently unlocks/i)).toBeVisible();
    expect(screen.getByRole("link", { name: "View credit packs" })).toHaveAttribute(
      "href",
      FULL_BOOK_UNLOCK_HREF,
    );
    expect(screen.queryByText("Step 01 / 04")).not.toBeInTheDocument();
  });

  it("opens Clerk email settings and can recheck verification", () => {
    render(
      <NewBookWizard
        userId="user-unverified"
        accountManagementEnabled
        access={{
          ...existingTrialAccess,
          emailVerified: false,
          trialProjectId: null,
          reason: "verify_email",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open email settings" }));
    expect(openUserProfile).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "Check verification again" }));
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("offers a saved setup explicitly and resumes its answers on Step 1", async () => {
    window.localStorage.setItem(
      wizardDraftKey("user-2", "full_book"),
      serializeDraft(
        {
          ...initialWizardState,
          step: 3,
          genre: "mystery",
          title: "The Last Lantern",
          brief: "A retired keeper finds a coded warning inside the harbor lantern.",
        },
        "full_book",
      ),
    );

    render(<NewBookWizard userId="user-2" access={fullBookAccess} />);

    expect(
      await screen.findByRole("heading", { name: "Continue where you left off?" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Resume saved setup" }));

    expect(await screen.findByText("Step 01 / 04")).toBeVisible();
    expect(screen.getByText("Mystery").closest("button")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByLabelText("Working title")).toHaveValue("The Last Lantern");
  });

  it("returns a valid same-account checkout draft to final confirmation", async () => {
    mockEstimate();
    window.localStorage.setItem(
      wizardDraftKey("user-checkout-return", "full_book"),
      serializeDraft(
        {
          ...initialWizardState,
          genre: "mystery",
          title: "The Last Lantern",
          brief: "A retired keeper finds a coded warning inside the harbor lantern.",
        },
        "full_book",
      ),
    );

    render(
      <NewBookWizard userId="user-checkout-return" access={fullBookAccess} resumeAfterCheckout />,
    );

    expect(await screen.findByText("Step 04 / 04")).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Continue where you left off?" }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("The Last Lantern").length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "Start the book" })).toBeVisible();
  });

  it("never uses another account's draft for a checkout return", async () => {
    window.localStorage.setItem(
      wizardDraftKey("different-user", "full_book"),
      serializeDraft(
        {
          ...initialWizardState,
          genre: "mystery",
          title: "A Different Book",
          brief: "This valid setup belongs to a different signed-in account.",
        },
        "full_book",
      ),
    );

    render(<NewBookWizard userId="current-user" access={fullBookAccess} resumeAfterCheckout />);

    expect(await screen.findByText("Step 01 / 04")).toBeVisible();
    expect(screen.queryByText("A Different Book")).not.toBeInTheDocument();
  });

  it("requires the visible working title before advancing", async () => {
    render(
      <NewBookWizard initialGenre="science_fiction" userId="user-3" access={fullBookAccess} />,
    );
    await screen.findByText("Step 01 / 04");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    fireEvent.change(screen.getByLabelText("Your brief"), {
      target: { value: "A pilot discovers the route home exists one day in the future." },
    });
    expect(screen.getByRole("button", { name: "Next" })).toHaveAttribute("aria-disabled", "true");

    fireEvent.change(screen.getByLabelText("Working title"), {
      target: { value: "Tomorrow's Passage" },
    });
    expect(screen.getByRole("button", { name: "Next" })).not.toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("locks the included story length while preserving creative controls", async () => {
    render(<NewBookWizard initialGenre="fantasy" userId="user-4" access={trialAccess} />);
    await screen.findByText("Step 01 / 04");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Working title"), {
      target: { value: "The Glass Road" },
    });
    fireEvent.change(screen.getByLabelText("Your brief"), {
      target: { value: "A courier discovers the road remembers everyone who crossed it." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Your included short story")).toBeVisible();
    expect(screen.getByText("~1,000 words")).toBeVisible();
    expect(screen.queryByLabelText("Chapters")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Point of view")).toBeVisible();
    expect(screen.getByLabelText("Tense")).toBeVisible();
  });

  it("does not start while the current shape has no valid quote", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "The changed shape could not be quoted." }),
      })),
    );
    render(<NewBookWizard initialGenre="mystery" userId="user-unquoted" access={fullBookAccess} />);
    await screen.findByText("Step 01 / 04");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Working title"), {
      target: { value: "The Unpriced Door" },
    });
    fireEvent.change(screen.getByLabelText("Your brief"), {
      target: { value: "A locked door appears wherever a forgotten promise was made." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const start = await screen.findByRole("button", { name: "Start the book" });
    expect(start).toHaveAttribute("aria-disabled", "true");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The changed shape could not be quoted.",
    );
    fireEvent.click(start);
    expect(startBook).not.toHaveBeenCalled();
  });

  it("sends an underfunded full book to credit packs before starting", async () => {
    mockEstimate(0.5);
    render(
      <NewBookWizard initialGenre="mystery" userId="user-needs-credits" access={fullBookAccess} />,
    );
    await screen.findByText("Step 01 / 04");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Working title"), {
      target: { value: "The Last Receipt" },
    });
    fireEvent.change(screen.getByLabelText("Your brief"), {
      target: { value: "A bookseller finds a receipt dated one day after the shop disappears." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    const addCredits = await screen.findByRole("button", { name: "Add credits to start" });
    expect(addCredits).toHaveAttribute(
      "href",
      "/studio/credits?return=%2Fstudio%2Fnew%3Fresume%3Dcheckout",
    );
    addCredits.addEventListener("click", (event) => event.preventDefault(), { once: true });
    fireEvent.click(addCredits);
    expect(
      window.localStorage.getItem(wizardDraftKey("user-needs-credits", "full_book")),
    ).toContain("The Last Receipt");
    expect(screen.queryByRole("button", { name: "Start the book" })).not.toBeInTheDocument();
    expect(startBook).not.toHaveBeenCalled();
  });

  it("clears a submission error when the author navigates or edits", async () => {
    mockEstimate();
    startBook.mockResolvedValue({
      status: "validation_error",
      message: "Please review the title.",
      fieldErrors: {},
    });

    await completeFullBookSetup("user-5");
    fireEvent.click(screen.getByRole("button", { name: "Start the book" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Please review the title.");
    const back = screen.getByRole("button", { name: "Back" });
    await waitFor(() => expect(back).toBeEnabled());
    fireEvent.click(back);
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("records success and clears local setup only after an accepted handoff", async () => {
    mockEstimate();
    startBook.mockResolvedValue({
      status: "accepted",
      projectId: "project-accepted",
      runId: "run-accepted",
      experience: "full_book",
    });

    await completeFullBookSetup("user-6");
    fireEvent.click(screen.getByRole("button", { name: "Start the book" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/projects/project-accepted/write"));
    expect(track).toHaveBeenCalledWith(
      "book_started",
      expect.objectContaining({ genre: "mystery", reattached: false }),
    );
    expect(window.localStorage.getItem(wizardDraftKey("user-6", "full_book"))).toBeNull();
    expect(window.localStorage.getItem(wizardRequestKey("user-6", "full_book"))).toBeNull();
  });

  it("keeps the setup and request key when a saved project needs recovery", async () => {
    mockEstimate();
    startBook.mockResolvedValue({
      status: "start_failed",
      projectId: "project-saved",
      runId: "run-failed",
      message: "Writing did not begin.",
      noWorkStarted: true,
    });

    await completeFullBookSetup("user-7");
    fireEvent.click(screen.getByRole("button", { name: "Start the book" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/projects/project-saved/write"));
    await waitFor(() =>
      expect(window.localStorage.getItem(wizardDraftKey("user-7", "full_book"))).not.toBeNull(),
    );
    expect(window.localStorage.getItem(wizardRequestKey("user-7", "full_book"))).not.toBeNull();
    expect(track).not.toHaveBeenCalledWith("book_started", expect.anything());
  });

  it("never reuses a retained failed-trial identity after full-book purchase unlocks", async () => {
    const userId = "user-purchased-after-trial-failure";
    const failedTrialKey = "11111111-1111-4111-8111-111111111111";
    window.localStorage.setItem(
      wizardDraftKey(userId, "trial_short_story"),
      serializeDraft(
        {
          ...initialWizardState,
          genre: "fantasy",
          title: "The Included Glass Road",
          brief: "A courier discovers the road remembers everyone who crossed it.",
          chapters: 3,
          wordsPerChapter: 1_000,
        },
        "trial_short_story",
      ),
    );
    window.localStorage.setItem(wizardRequestKey(userId, "trial_short_story"), failedTrialKey);
    mockEstimate();
    startBook.mockResolvedValue({
      status: "accepted",
      projectId: "new-paid-full-book",
      runId: "new-paid-run",
      experience: "full_book",
    });

    await completeFullBookSetup(userId);
    expect(screen.queryByRole("heading", { name: "Continue where you left off?" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Start the book" }));

    await waitFor(() => expect(startBook).toHaveBeenCalledOnce());
    expect(startBook.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        requestKey: expect.not.stringMatching(new RegExp(`^${failedTrialKey}$`)),
      }),
    );
    expect(window.localStorage.getItem(wizardRequestKey(userId, "trial_short_story"))).toBe(
      failedTrialKey,
    );
    expect(window.localStorage.getItem(wizardDraftKey(userId, "trial_short_story"))).not.toBeNull();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/projects/new-paid-full-book/write"));
  });

  it("passes the isolated startup-failure mode only when the server page supplied it", async () => {
    mockEstimate();
    startBook.mockResolvedValue({
      status: "start_failed",
      projectId: "project-isolated-failure",
      runId: "run-isolated-failure",
      message: "Writing didn’t begin. No credits were used.",
      noWorkStarted: true,
    });

    await completeFullBookSetup("user-e2e", { e2eStartMode: "fail_before_work" });
    fireEvent.click(screen.getByRole("button", { name: "Start the book" }));

    await waitFor(() =>
      expect(startBook).toHaveBeenCalledWith(
        expect.objectContaining({ e2eStartMode: "fail_before_work" }),
      ),
    );
  });
});
