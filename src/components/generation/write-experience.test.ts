import { describe, expect, it } from "vitest";

import { wizardDraftKey, wizardRequestKey } from "@/components/wizard/wizard-state";
import {
  canAttachToWholeBookRun,
  clearRecoveredWizardStorage,
  generationRequestStorageKey,
} from "./write-experience";

describe("canAttachToWholeBookRun", () => {
  it("accepts a newly queued full-book run", () => {
    expect(canAttachToWholeBookRun(202, "run-1", undefined)).toBe(true);
  });

  it("reattaches only to an existing full-book run", () => {
    expect(canAttachToWholeBookRun(409, "run-1", "full_book")).toBe(true);
    expect(canAttachToWholeBookRun(409, "run-2", "chapter")).toBe(false);
    expect(canAttachToWholeBookRun(409, "run-3", "edit_pass")).toBe(false);
  });

  it("never attaches without a run id", () => {
    expect(canAttachToWholeBookRun(202, undefined, "full_book")).toBe(false);
  });

  it("scopes uncertain generation request keys to one project", () => {
    expect(generationRequestStorageKey("project-a")).not.toBe(
      generationRequestStorageKey("project-b"),
    );
  });

  it("clears a retained setup only when it belongs to the recovered project", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const userId = "user_123";
    values.set(
      wizardRequestKey(userId, "trial_short_story"),
      "11111111-1111-4111-8111-111111111111",
    );
    values.set(wizardDraftKey(userId, "trial_short_story"), "saved setup");

    expect(
      clearRecoveredWizardStorage(
        storage,
        userId,
        "trial_short_story",
        "22222222-2222-4222-8222-222222222222",
      ),
    ).toBe(false);
    expect(values.get(wizardDraftKey(userId, "trial_short_story"))).toBe("saved setup");

    expect(
      clearRecoveredWizardStorage(
        storage,
        userId,
        "trial_short_story",
        "11111111-1111-4111-8111-111111111111",
      ),
    ).toBe(true);
    expect(values.has(wizardRequestKey(userId, "trial_short_story"))).toBe(false);
    expect(values.has(wizardDraftKey(userId, "trial_short_story"))).toBe(false);
  });

  it("does not clear the retained included-story setup while confirming a paid book", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    const userId = "user_123";
    const recoveryKey = "11111111-1111-4111-8111-111111111111";
    values.set(wizardRequestKey(userId, "trial_short_story"), recoveryKey);
    values.set(wizardDraftKey(userId, "trial_short_story"), "saved included setup");

    expect(clearRecoveredWizardStorage(storage, userId, "full_book", recoveryKey)).toBe(false);
    expect(values.get(wizardRequestKey(userId, "trial_short_story"))).toBe(recoveryKey);
    expect(values.get(wizardDraftKey(userId, "trial_short_story"))).toBe("saved included setup");
  });
});
