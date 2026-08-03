import "server-only";

import { Resend } from "resend";

/**
 * Transactional email. Every message is triggered by an author action or a
 * state that now needs the author's attention. No marketing and no progress
 * digests: these are receipts and recovery notices, not a campaign.
 *
 * Degrades to a no-op when RESEND_API_KEY is absent (preview envs, local dev
 * without the key), so email can never be the reason a workflow step fails —
 * callers also catch, because a book that finished but couldn't say so is
 * still a finished book.
 */

const FROM = "sopher.ai <no-reply@sopher.ai>";

let client: Resend | null = null;

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);

/** Author-controlled titles and notes must never become email markup. */
export function escapeEmailHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );
}

export function sanitizeEmailSubject(value: string): string {
  return value
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f7f6f3;font-family:Georgia,'Times New Roman',serif;color:#14161c;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e2e0da;border-radius:10px;padding:32px;">
      <p style="margin:0 0 4px;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#4a5fd0;">sopher.ai</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;">${title}</h1>
      ${bodyHtml}
    </div>
    <p style="max-width:520px;margin:16px auto 0;font-family:ui-sans-serif,system-ui,sans-serif;font-size:12px;color:#7c8296;">
      Sent because of activity on your sopher.ai account. Questions:
      <a href="mailto:support@sopher.ai" style="color:#4a5fd0;">support@sopher.ai</a>
    </p>
  </body>
</html>`;
}

const p = (text: string) =>
  `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#4a4f5e;">${text}</p>`;
const cta = (href: string, label: string) =>
  `<p style="margin:20px 0 0;"><a href="${href}" style="display:inline-block;background:#4a5fd0;color:#ffffff;text-decoration:none;border-radius:8px;padding:10px 20px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;font-weight:600;">${label}</a></p>`;

async function deliver(
  to: string,
  subject: string,
  html: string,
  idempotencyKey?: string,
): Promise<void> {
  const resend = getResend();
  if (!resend || !to) return;
  try {
    await resend.emails.send(
      { from: FROM, to, subject, html },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
  } catch (error) {
    // Email is best-effort by design; the product state is already correct.
    console.warn("[email] send failed:", error instanceof Error ? error.message : error);
  }
}

export async function sendBookFinishedEmail(input: {
  to: string;
  bookTitle: string;
  projectId: string;
  chapterCount: number;
  wordCount: number;
  runId?: string;
}): Promise<void> {
  const url = `https://sopher.ai/projects/${input.projectId}/manuscript`;
  const title = escapeEmailHtml(input.bookTitle);
  await deliver(
    input.to,
    sanitizeEmailSubject(`“${input.bookTitle}” is finished`),
    shell(
      "Your book is finished.",
      p(
        `<em>${title}</em> — ${input.chapterCount} chapters, ${input.wordCount.toLocaleString(
          "en-US",
        )} words — is written, edited, and waiting for you.`,
      ) + cta(url, "Open your manuscript"),
    ),
    input.runId ? `run:${input.runId}:book-finished` : undefined,
  );
}

export async function sendCreditsPausedEmail(input: {
  to: string;
  bookTitle: string;
  projectId: string;
  balance: number;
  required: number;
  runId?: string;
  pauseVersion?: number;
}): Promise<void> {
  const url = `https://sopher.ai/studio/credits?return=${encodeURIComponent(
    `/projects/${input.projectId}/write`,
  )}${input.runId ? `&resumeRun=${encodeURIComponent(input.runId)}` : ""}`;
  const title = escapeEmailHtml(input.bookTitle);
  await deliver(
    input.to,
    sanitizeEmailSubject(`Writing paused on “${input.bookTitle}”`),
    shell(
      "Writing is paused — out of credits.",
      p(
        `<em>${title}</em> needs about ${Math.ceil(input.required)} credits to continue and your balance is ${input.balance.toFixed(1)}. Every chapter drafted so far is safe; the book picks up exactly where it stopped once you top up.`,
      ) + cta(url, "Add credits and resume"),
    ),
    input.runId ? `run:${input.runId}:credits-paused:${input.pauseVersion ?? 0}` : undefined,
  );
}

export async function sendIncludedStoryPausedEmail(input: {
  to: string;
  bookTitle: string;
  projectId: string;
  runId: string;
  pauseVersion?: number;
  supportReference: string;
}): Promise<void> {
  const url = `https://sopher.ai/projects/${input.projectId}/write`;
  const title = escapeEmailHtml(input.bookTitle);
  await deliver(
    input.to,
    sanitizeEmailSubject(`Your included story “${input.bookTitle}” needs attention`),
    shell(
      "Your included story is safely paused.",
      p(
        `<em>${title}</em> reached a protected production boundary before it finished. Your saved work is safe, and you do not need to purchase credits to resolve this.`,
      ) +
        p(`Support reference: <strong>${escapeEmailHtml(input.supportReference)}</strong>`) +
        cta(url, "Review recovery options"),
    ),
    `run:${input.runId}:included-story-paused:${input.pauseVersion ?? 0}`,
  );
}

export async function sendOutlineApprovalEmail(input: {
  to: string;
  bookTitle: string;
  projectId: string;
  runId: string;
  pauseVersion: number;
  reminder?: boolean;
}): Promise<void> {
  const url = `https://sopher.ai/projects/${input.projectId}/outline`;
  const title = escapeEmailHtml(input.bookTitle);
  await deliver(
    input.to,
    sanitizeEmailSubject(
      input.reminder
        ? `Your outline for “${input.bookTitle}” is waiting`
        : `Review the outline for “${input.bookTitle}”`,
    ),
    shell(
      input.reminder ? "Your outline is still waiting for you." : "Your outline is ready.",
      p(
        `We have paused before drafting <em>${title}</em>. Review the plan, then approve it or send it back with notes. No chapters will be written until you decide.`,
      ) + cta(url, "Review the outline"),
    ),
    `run:${input.runId}:outline-${input.reminder ? "reminder" : "ready"}:${input.pauseVersion}`,
  );
}

export async function sendAuthoringNeedsAttentionEmail(input: {
  to: string;
  bookTitle: string;
  runId: string;
  savedChapterCount: number;
  creditsUsed: number;
  noWorkStarted: boolean;
  supportReference: string;
  nextActionHref: string;
  nextActionLabel: string;
}): Promise<void> {
  const url = input.nextActionHref.startsWith("/")
    ? `https://sopher.ai${input.nextActionHref}`
    : input.nextActionHref;
  const title = escapeEmailHtml(input.bookTitle);
  const savedWork = input.noWorkStarted
    ? "Writing did not begin, and no credits were used."
    : `${input.savedChapterCount.toLocaleString("en-US")} chapter${
        input.savedChapterCount === 1 ? "" : "s"
      } ${input.savedChapterCount === 1 ? "is" : "are"} saved. ${input.creditsUsed.toFixed(
        1,
      )} credits were used for completed work.`;
  await deliver(
    input.to,
    sanitizeEmailSubject(`Writing needs attention on “${input.bookTitle}”`),
    shell(
      "Your book needs a quick check.",
      p(`<em>${title}</em> stopped before production completed. ${savedWork}`) +
        p(`Support reference: <strong>${escapeEmailHtml(input.supportReference)}</strong>`) +
        cta(escapeEmailHtml(url), escapeEmailHtml(input.nextActionLabel)),
    ),
    `run:${input.runId}:needs-attention`,
  );
}

export async function sendReceiptEmail(input: {
  to: string;
  packName: string;
  credits: number;
  usd: number;
  idempotencyKey?: string;
}): Promise<void> {
  const packName = escapeEmailHtml(input.packName);
  await deliver(
    input.to,
    `Receipt — ${input.credits} credits`,
    shell(
      "Thanks — credits added.",
      p(
        `Your ${packName} purchase of <strong>${input.credits} credits</strong> ($${input.usd.toFixed(2)}) is on your balance now.`,
      ) + cta("https://sopher.ai/studio/credits", "View your balance"),
    ),
    input.idempotencyKey,
  );
}
