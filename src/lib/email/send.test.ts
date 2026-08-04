import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: "email-1" } }));
const notificationMocks = vi.hoisted(() => ({
  claim: vi.fn().mockResolvedValue("claim-token"),
  settle: vi.fn().mockResolvedValue(undefined),
}));
const callerMocks = vi.hoisted(() => ({
  select: vi.fn(),
  resolveAction: vi.fn(),
  terminalize: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
vi.mock("@/lib/notification-preferences", () => ({
  claimAuthoringNotificationDelivery: notificationMocks.claim,
  settleAuthoringNotificationDelivery: notificationMocks.settle,
}));
// The two production callers below are exercised for real; only their edges —
// the database, the journey lookup and the terminal transition — are stubbed.
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => ({ select: callerMocks.select }),
}));
vi.mock("@/lib/authoring-email-action", () => ({
  resolveAuthoringEmailAction: callerMocks.resolveAction,
}));
vi.mock("@/lib/generation-runs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/generation-runs")>()),
  terminalizeAuthoringRun: callerMocks.terminalize,
}));

import { authoringFailureExplanation } from "@/lib/authoring-failures";
import { reconcileAuthoringRun, type RunHealth } from "@/lib/run-health";
import { notifyAuthoringFailureStep } from "@/workflows/notify-authoring-failure";

import {
  escapeEmailHtml,
  sanitizeEmailSubject,
  sendBookFinishedEmail,
  sendCreativeDecisionEmail,
  sendCreditsPausedEmail,
  sendIncludedStoryPausedEmail,
  sendAuthoringNeedsAttentionEmail,
  sendOutlineApprovalEmail,
  sendReceiptEmail,
} from "./send";

describe("transactional email safety", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    sendMock.mockClear();
    notificationMocks.claim.mockReset().mockResolvedValue("claim-token");
    notificationMocks.settle.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("escapes every author-controlled HTML delimiter", () => {
    expect(escapeEmailHtml(`A&B <script>"story" 'title'</script>`)).toBe(
      "A&amp;B &lt;script&gt;&quot;story&quot; &#39;title&#39;&lt;/script&gt;",
    );
  });

  it("leaves ordinary Unicode titles intact", () => {
    expect(escapeEmailHtml("מסע אל הכוכבים ✨")).toBe("מסע אל הכוכבים ✨");
  });

  it("removes line breaks from author-controlled email subjects", () => {
    expect(sanitizeEmailSubject("A title\r\nBcc: someone@example.com")).toBe(
      "A title Bcc: someone@example.com",
    );
  });

  it("uses a stable pause-version idempotency key and escapes the title body", async () => {
    await sendOutlineApprovalEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: `<The "Road">`,
      projectId: "project-1",
      runId: "run-1",
      pauseVersion: 3,
    });

    expect(sendMock).toHaveBeenCalledOnce();
    const [message, options] = sendMock.mock.calls[0] as [
      { html: string; subject: string },
      { idempotencyKey: string },
    ];
    expect(message.subject).toBe(`Review the outline for “<The "Road">”`);
    expect(message.html).toContain("&lt;The &quot;Road&quot;&gt;");
    expect(message.html).not.toContain(`<em><The`);
    expect(options).toEqual({ idempotencyKey: "run:run-1:outline-ready:3" });
    expect(notificationMocks.claim).toHaveBeenCalledWith({
      userId: "user-1",
      category: "authoringActionRequired",
      eventKey: "run:run-1:outline-ready:3",
    });
  });

  it("routes an included-story pause to recovery without a purchase prompt", async () => {
    await sendIncludedStoryPausedEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "The First Crossing",
      projectId: "project-1",
      runId: "run-1",
      pauseVersion: 2,
      supportReference: "SPH-TEST-PAUSE",
    });

    const [message, options] = sendMock.mock.calls[0] as [
      { html: string; subject: string },
      { idempotencyKey: string },
    ];
    expect(message.html).toContain("do not need to purchase credits");
    expect(message.html).toContain("SPH-TEST-PAUSE");
    expect(message.html).not.toMatch(/add credits|checkout/i);
    expect(options).toEqual({ idempotencyKey: "run:run-1:included-story-paused:2" });
    expect(notificationMocks.claim).toHaveBeenCalledWith({
      userId: "user-1",
      category: "authoringActionRequired",
      eventKey: "run:run-1:included-story-paused:2",
    });
  });

  it("deep-links a paid credit pause to its exact durable run", async () => {
    await sendCreditsPausedEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "The Long Crossing",
      projectId: "11111111-1111-4111-8111-111111111111",
      runId: "22222222-2222-4222-8222-222222222222",
      pauseVersion: 4,
      balance: 1,
      required: 5,
    });

    const [message, options] = sendMock.mock.calls[0] as [
      { html: string },
      { idempotencyKey: string },
    ];
    expect(message.html).toContain("resumeRun=22222222-2222-4222-8222-222222222222");
    expect(options).toEqual({
      idempotencyKey: "run:22222222-2222-4222-8222-222222222222:credits-paused:4",
    });
    expect(notificationMocks.claim).toHaveBeenCalledWith({
      userId: "user-1",
      category: "authoringActionRequired",
      eventKey: "run:22222222-2222-4222-8222-222222222222:credits-paused:4",
    });
  });

  it("uses the authoritative full-book partial recovery action", async () => {
    await sendAuthoringNeedsAttentionEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "The Crossing",
      runId: "run-partial",
      savedChapterCount: 2,
      creditsUsed: 1.5,
      noWorkStarted: false,
      supportReference: "SPH-PARTIAL",
      nextActionHref: "/projects/project-1/write",
      nextActionLabel: "Resume from saved work",
    });

    const [message] = sendMock.mock.calls[0] as [{ html: string }];
    expect(message.html).toContain("https://sopher.ai/projects/project-1/write");
    expect(message.html).toContain("Resume from saved work");
    expect(message.html).not.toContain("https://sopher.ai/projects/project-1/editor");
    expect(notificationMocks.claim).toHaveBeenCalledWith({
      userId: "user-1",
      category: "authoringActionRequired",
      eventKey: "run:run-partial:needs-attention",
    });
  });

  it("uses the authoritative scoped partial recovery action", async () => {
    await sendAuthoringNeedsAttentionEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "The Crossing",
      runId: "run-scoped-partial",
      savedChapterCount: 2,
      creditsUsed: 0.4,
      noWorkStarted: false,
      supportReference: "SPH-SCOPED",
      nextActionHref: "/projects/project-1/editor",
      nextActionLabel: "Resume from saved work",
    });

    const [message] = sendMock.mock.calls[0] as [{ html: string }];
    expect(message.html).toContain("https://sopher.ai/projects/project-1/editor");
    expect(message.html).toContain("Resume from saved work");
  });

  it("uses the authoritative zero-work start action", async () => {
    await sendAuthoringNeedsAttentionEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "The Crossing",
      runId: "run-zero",
      savedChapterCount: 0,
      creditsUsed: 0,
      noWorkStarted: true,
      supportReference: "SPH-ZERO",
      nextActionHref: "/projects/project-1/write",
      nextActionLabel: "Try starting again",
    });

    const [message] = sendMock.mock.calls[0] as [{ html: string }];
    expect(message.html).toContain("https://sopher.ai/projects/project-1/write");
    expect(message.html).toContain("Try starting again");
  });

  it("uses Contact support for a completion contradiction", async () => {
    await sendAuthoringNeedsAttentionEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "The Crossing",
      runId: "run-contradiction",
      savedChapterCount: 3,
      creditsUsed: 1.5,
      noWorkStarted: false,
      supportReference: "SPH-CONTRADICTION",
      nextActionHref:
        "mailto:support@sopher.ai?subject=Authoring%20help%20%C2%B7%20SPH-CONTRADICTION",
      nextActionLabel: "Contact support",
    });

    const [message] = sendMock.mock.calls[0] as [{ html: string }];
    expect(message.html).toContain("mailto:support@sopher.ai");
    expect(message.html).toContain("Contact support");
    expect(message.html).not.toContain("/write");
    expect(message.html).not.toContain("/editor");
  });

  it("names the cause and rules out a pointless retry for a deterministic failure", async () => {
    await sendAuthoringNeedsAttentionEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "The Crossing",
      runId: "run-continuity",
      savedChapterCount: 12,
      creditsUsed: 10.74,
      noWorkStarted: false,
      supportReference: "SPH-CONTINUITY",
      nextActionHref: "/projects/project-1/write",
      nextActionLabel: "Resume from saved work",
      errorCode: "provider_output_invalid",
      errorStage: "continuity",
    });

    const [message] = sendMock.mock.calls[0] as [{ html: string }];
    expect(message.html).toContain(
      "The Studio could not read the answer it got back during the final read-through for continuity.",
    );
    expect(message.html).toContain("Trying again right now would end the same way");
    expect(message.html).not.toContain("finish reason");
    expect(message.html).not.toContain("provider_output_invalid");
  });

  it("tells an author to wait when the provider was the problem", async () => {
    await sendAuthoringNeedsAttentionEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "The Crossing",
      runId: "run-busy",
      savedChapterCount: 4,
      creditsUsed: 2,
      noWorkStarted: false,
      supportReference: "SPH-BUSY",
      nextActionHref: "/projects/project-1/write",
      nextActionLabel: "Resume from saved work",
      errorCode: "provider_rate_limited",
    });

    const [message] = sendMock.mock.calls[0] as [{ html: string }];
    expect(message.html).toContain("The writing service was too busy to take the request.");
    expect(message.html).toContain("wait a few minutes, then try again");
  });

  it("still says something useful when no cause was recorded", async () => {
    await sendAuthoringNeedsAttentionEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "The Crossing",
      runId: "run-unknown",
      savedChapterCount: 2,
      creditsUsed: 1,
      noWorkStarted: false,
      supportReference: "SPH-UNKNOWN",
      nextActionHref: "/projects/project-1/write",
      nextActionLabel: "Resume from saved work",
    });

    const [message] = sendMock.mock.calls[0] as [{ html: string }];
    expect(message.html).toContain("Production stopped before the manuscript was finished.");
    expect(message.html).toContain("This is worth trying again.");
  });

  it("suppresses an optional notice before Resend and durably keeps its event decision", async () => {
    notificationMocks.claim.mockResolvedValue(null);

    await sendBookFinishedEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "Quiet Arrival",
      projectId: "project-1",
      runId: "run-quiet",
      chapterCount: 3,
      wordCount: 3000,
    });

    expect(notificationMocks.claim).toHaveBeenCalledWith({
      userId: "user-1",
      category: "authoringCompleted",
      eventKey: "run:run-quiet:book-finished",
    });
    expect(sendMock).not.toHaveBeenCalled();
    expect(notificationMocks.settle).not.toHaveBeenCalled();
  });

  it("maps creative decisions and delayed outline reminders to distinct preferences", async () => {
    await sendCreativeDecisionEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "A Fork in the Story",
      projectId: "project-1",
      runId: "run-guided",
      pauseVersion: 2,
    });
    await sendOutlineApprovalEmail({
      userId: "user-1",
      to: "author@example.com",
      bookTitle: "A Fork in the Story",
      projectId: "project-1",
      runId: "run-guided",
      pauseVersion: 3,
      reminder: true,
    });

    expect(notificationMocks.claim).toHaveBeenNthCalledWith(1, {
      userId: "user-1",
      category: "authoringActionRequired",
      eventKey: "run:run-guided:creative-decision:2",
    });
    expect(notificationMocks.claim).toHaveBeenNthCalledWith(2, {
      userId: "user-1",
      category: "authoringReminders",
      eventKey: "run:run-guided:outline-reminder:3",
    });
    expect(sendMock.mock.calls[0]?.[0].html).toContain("Manage email preferences");
  });

  it("never subjects a purchase receipt to optional authoring preferences", async () => {
    notificationMocks.claim.mockResolvedValue(null);

    await sendReceiptEmail({
      to: "author@example.com",
      packName: "Story",
      credits: 12,
      usd: 10,
      idempotencyKey: "receipt-1",
    });

    expect(notificationMocks.claim).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledOnce();
    expect(sendMock.mock.calls[0]?.[1]).toEqual({ idempotencyKey: "receipt-1" });
  });
});

/**
 * Every test above calls `sendAuthoringNeedsAttentionEmail` directly, so all of
 * them passed while both production callers silently omitted `errorCode` — and
 * every real "needs attention" email told the author to try again, including
 * for `provider_output_invalid`, where the in-app recovery card says the exact
 * opposite. These drive the callers instead, and assert against the same
 * `authoringFailureExplanation` call the card makes rather than against a
 * hardcoded sentence, so the two surfaces cannot drift apart again.
 */
describe("the needs-attention email, driven by its real callers", () => {
  /** A drizzle builder stub: every stage chains, and awaiting any stage yields. */
  function queryStub(rows: Record<string, unknown>[]) {
    const chain: Record<string, unknown> = {
      then: (resolve: (value: Record<string, unknown>[]) => unknown) =>
        Promise.resolve(rows).then(resolve),
    };
    for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
      chain[method] = () => chain;
    }
    return chain;
  }

  /** What the recovery card renders for the failure that killed the 08-04 run. */
  const cardExplanation = authoringFailureExplanation({
    errorCode: "provider_output_invalid",
    errorStage: "continuity",
    savedChapterCount: 12,
  });

  function expectMatchesRecoveryCard() {
    expect(cardExplanation.retry).toBe("not_worth_retrying");
    expect(sendMock).toHaveBeenCalledOnce();
    const [message] = sendMock.mock.calls[0] as [{ html: string }];
    expect(message.html).toContain(cardExplanation.cause);
    expect(message.html).toContain(cardExplanation.retryStatement);
    // The default the email fell back to while the callers passed nothing.
    expect(message.html).not.toContain("This is worth trying again.");
    expect(message.html).not.toContain(
      "Production stopped before the manuscript was finished during the final read-through for continuity.",
    );
    // Diagnostics belong in the support handoff, never in author-facing copy.
    expect(message.html).not.toContain("provider_output_invalid");
  }

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    sendMock.mockClear();
    notificationMocks.claim.mockReset().mockResolvedValue("claim-token");
    notificationMocks.settle.mockReset().mockResolvedValue(undefined);
    callerMocks.select.mockReset();
    callerMocks.terminalize.mockReset().mockResolvedValue(undefined);
    callerMocks.resolveAction.mockReset().mockResolvedValue({
      href: "/projects/project-1/write",
      label: "Resume from saved work",
    });
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it("carries the workflow step's recorded cause into the email", async () => {
    callerMocks.select
      .mockReturnValueOnce(
        queryStub([
          {
            email: "author@example.com",
            title: "The Crossing",
            supportReference: "SPH-STEP",
            status: "failed",
            savedChapterCount: 12,
            rootErrorCode: "provider_output_invalid",
            rootErrorStage: "continuity",
          },
        ]),
      )
      .mockReturnValueOnce(queryStub([{ creditsUsed: 10.74 }]));

    await notifyAuthoringFailureStep({
      dbRunId: "run-step",
      projectId: "project-1",
      userId: "user-1",
    });

    expectMatchesRecoveryCard();
  });

  it("carries the watchdog's recorded cause into the email", async () => {
    callerMocks.select.mockReturnValueOnce(
      queryStub([{ email: "author@example.com", title: "The Crossing" }]),
    );

    await reconcileAuthoringRun(
      {
        id: "run-watchdog",
        projectId: "project-1",
        userId: "user-1",
        kind: "full_book",
        // Not a v2/v3 protocol, so the input-redelivery probe stops before it
        // would need the database.
        config: { protocolVersion: 1 },
      } as never,
      {
        getHealth: async () =>
          failedHealth({
            rootErrorCode: "provider_output_invalid",
            rootErrorStage: "continuity",
          }),
      },
    );

    expect(callerMocks.terminalize).toHaveBeenCalledOnce();
    expectMatchesRecoveryCard();
  });

  it("falls back to the live stage when only the code was recorded", async () => {
    callerMocks.select.mockReturnValueOnce(
      queryStub([{ email: "author@example.com", title: "The Crossing" }]),
    );

    await reconcileAuthoringRun(
      {
        id: "run-nostage",
        projectId: "project-1",
        userId: "user-1",
        kind: "full_book",
        config: {},
      } as never,
      {
        getHealth: async () =>
          failedHealth({ rootErrorCode: "provider_output_invalid", rootErrorStage: null }),
      },
    );

    // `stage` is "continuity", so the card and the email name the same place.
    expectMatchesRecoveryCard();
  });
});

function failedHealth(overrides: Partial<RunHealth>): RunHealth {
  return {
    databaseStatus: "running",
    workflowStatus: "failed",
    effectiveStatus: "running",
    acceptedAt: "2026-08-04T12:00:00.000Z",
    startedAt: "2026-08-04T12:00:01.000Z",
    completedAt: null,
    workflowStartedAt: "2026-08-04T12:00:01.000Z",
    workflowCompletedAt: null,
    lastEventAt: "2026-08-04T12:40:00.000Z",
    heartbeatAt: "2026-08-04T12:40:00.000Z",
    lastUpdateAt: "2026-08-04T12:40:00.000Z",
    elapsedMs: 2_400_000,
    estimatedMinutes: null,
    stage: "continuity",
    progressPct: 96,
    stageDescription: null,
    chapters: { total: 12, planned: 0, drafting: 0, drafted: 0, edited: 12, final: 0 },
    spend: { meteredUsd: 3.2, creditsUsed: 10.74 },
    authoringBegan: true,
    noWorkStarted: false,
    acceptanceUncertain: false,
    safeToRetry: false,
    completionArtifactsReady: false,
    completionEvidence: null,
    health: "critical",
    dispatchAttempts: 1,
    workflowMissingCount: 0,
    workflowMissingSince: null,
    cancellation: null,
    pause: null,
    savedChapterCount: 12,
    savedCheckpointCount: 12,
    supportReference: "SPH-WATCHDOG",
    rootErrorCode: null,
    rootErrorStage: null,
    ...overrides,
  };
}
