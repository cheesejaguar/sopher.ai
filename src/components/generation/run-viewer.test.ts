import { describe, expect, it } from "vitest";

import {
  isAuthoritativeFullBookCompletion,
  isAuthoritativeRunTerminal,
  isRecoveryActionAuthorized,
  projectProgressForRun,
  recoveryCardPrimaryAction,
} from "./run-viewer";

describe("projectProgressForRun", () => {
  it("preserves the concrete stage paused by an awaiting-credits gate", () => {
    expect(
      projectProgressForRun(
        {
          stage: "awaiting_credits",
          pausedStage: "editing",
          pct: 72,
          detail: "Add credits to continue",
        },
        12,
        12,
      ),
    ).toEqual({
      stage: "awaiting_credits",
      pausedStage: "editing",
      pct: 72,
      detail: "Add credits to continue",
      draftedCount: 12,
      totalChapters: 12,
    });
  });

  it("publishes an accepted cancellation request and health-confirmed completion signal", () => {
    expect(
      projectProgressForRun(
        {
          stage: "done",
          pct: 100,
          detail: "The manuscript is ready",
        },
        3,
        3,
        {
          cancellationRequestedAt: "2026-07-30T12:05:00.000Z",
          authoritativeTerminal: true,
          authoritativeCompletion: true,
        },
      ),
    ).toMatchObject({
      stage: "done",
      cancellationRequestedAt: "2026-07-30T12:05:00.000Z",
      authoritativeTerminal: true,
      authoritativeCompletion: true,
    });
  });
});

describe("isAuthoritativeRunTerminal", () => {
  it("does not trust a raw terminal stage while health still reports active work", () => {
    expect(
      isAuthoritativeRunTerminal({
        health: {
          databaseStatus: "running",
          effectiveStatus: "running",
          noWorkStarted: false,
        },
      }),
    ).toBe(false);
  });

  it.each(["failed", "cancelled"] as const)(
    "refreshes the server journey after health confirms %s",
    (effectiveStatus) => {
      expect(
        isAuthoritativeRunTerminal({
          health: {
            databaseStatus: effectiveStatus,
            effectiveStatus,
            noWorkStarted: false,
          },
        }),
      ).toBe(true);
    },
  );

  it("refreshes contradictory completion so the server can route it to support", () => {
    const state = {
      stage: "done" as const,
      health: {
        databaseStatus: "completed" as const,
        effectiveStatus: "completed" as const,
        completionArtifactsReady: false,
        noWorkStarted: false,
      },
    };

    expect(isAuthoritativeRunTerminal(state)).toBe(true);
    expect(isAuthoritativeFullBookCompletion("full_book", state)).toBe(false);
  });
});

describe("isAuthoritativeFullBookCompletion", () => {
  it("does not trust a raw done stage without completed health and artifact proof", () => {
    expect(
      isAuthoritativeFullBookCompletion("full_book", {
        stage: "done",
        health: {
          databaseStatus: "running",
          effectiveStatus: "running",
          noWorkStarted: false,
        },
      }),
    ).toBe(false);
  });

  it("accepts only a health-confirmed full-book completion with artifact proof", () => {
    expect(
      isAuthoritativeFullBookCompletion("full_book", {
        stage: "done",
        health: {
          databaseStatus: "completed",
          effectiveStatus: "completed",
          completionArtifactsReady: true,
          noWorkStarted: false,
        },
      }),
    ).toBe(true);
    expect(
      isAuthoritativeFullBookCompletion("chapter", {
        stage: "done",
        health: {
          databaseStatus: "completed",
          effectiveStatus: "completed",
          completionArtifactsReady: true,
          noWorkStarted: false,
        },
      }),
    ).toBe(false);
  });
});

describe("recoveryCardPrimaryAction", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";

  it("uses the authoritative support action instead of opening a manuscript", () => {
    expect(
      recoveryCardPrimaryAction({
        projectId,
        savedChapterCount: 2,
        canRecover: false,
        nextAction: {
          kind: "contact_support",
          href: "mailto:support@sopher.ai?subject=Needs%20attention",
          label: "Contact support",
          description: "Support must recheck the durable evidence.",
          requiresMeteredAccess: false,
        },
      }),
    ).toEqual({
      kind: "link",
      href: "mailto:support@sopher.ai?subject=Needs%20attention",
      label: "Contact support",
    });
  });

  it("never offers Open saved manuscript when zero chapters are saved", () => {
    const action = recoveryCardPrimaryAction({
      projectId,
      savedChapterCount: 0,
      canRecover: false,
      nextAction: null,
    });

    expect(action).toMatchObject({ kind: "link", label: "Contact support" });
    expect(action.label).not.toBe("Open saved manuscript");
  });

  it("offers a callback only when saved-work recovery is authoritative and enabled", () => {
    expect(
      recoveryCardPrimaryAction({
        projectId,
        savedChapterCount: 1,
        canRecover: true,
        nextAction: {
          kind: "recover_saved_work",
          href: `/projects/${projectId}/write#authoring-recovery`,
          label: "Resume from saved work",
          description: "One checkpoint is compatible.",
          requiresMeteredAccess: true,
        },
      }),
    ).toEqual({ kind: "recover", label: "Resume from saved work" });
  });
});

describe("isRecoveryActionAuthorized", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const recoveryAction = {
    kind: "recover_saved_work" as const,
    href: `/projects/${projectId}/write#authoring-recovery`,
    label: "Resume from saved work",
    description: "Review the recovery details before restarting.",
    requiresMeteredAccess: true,
  };

  it("authorizes the full-book callback at the recovery fragment", () => {
    expect(isRecoveryActionAuthorized(recoveryAction, projectId, "full_book")).toBe(true);
  });

  it("rejects a dangling page link and scoped runs", () => {
    expect(
      isRecoveryActionAuthorized(
        { ...recoveryAction, href: `/projects/${projectId}/write` },
        projectId,
        "full_book",
      ),
    ).toBe(false);
    expect(isRecoveryActionAuthorized(recoveryAction, projectId, "edit_pass")).toBe(false);
  });
});
