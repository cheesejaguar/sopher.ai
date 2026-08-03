import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { id: "email-1" } }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

import {
  escapeEmailHtml,
  sanitizeEmailSubject,
  sendCreditsPausedEmail,
  sendIncludedStoryPausedEmail,
  sendAuthoringNeedsAttentionEmail,
  sendOutlineApprovalEmail,
} from "./send";

describe("transactional email safety", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-key";
    sendMock.mockClear();
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
  });

  it("routes an included-story pause to recovery without a purchase prompt", async () => {
    await sendIncludedStoryPausedEmail({
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
  });

  it("deep-links a paid credit pause to its exact durable run", async () => {
    await sendCreditsPausedEmail({
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
  });

  it("uses the authoritative full-book partial recovery action", async () => {
    await sendAuthoringNeedsAttentionEmail({
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
  });

  it("uses the authoritative scoped partial recovery action", async () => {
    await sendAuthoringNeedsAttentionEmail({
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
});
