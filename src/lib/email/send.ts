import { Resend } from "resend";

/**
 * Transactional email. Three messages exist, all triggered by things the user
 * did: their book finished, their book paused for credits, they bought
 * credits. No marketing, no digests, so there is no unsubscribe machinery —
 * every mail is a receipt for an action.
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

async function deliver(to: string, subject: string, html: string): Promise<void> {
  const resend = getResend();
  if (!resend || !to) return;
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
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
}): Promise<void> {
  const url = `https://sopher.ai/projects/${input.projectId}/manuscript`;
  await deliver(
    input.to,
    `“${input.bookTitle}” is finished`,
    shell(
      "Your book is finished.",
      p(
        `<em>${input.bookTitle}</em> — ${input.chapterCount} chapters, ${input.wordCount.toLocaleString(
          "en-US",
        )} words — is written, edited, and waiting for you.`,
      ) + cta(url, "Open your manuscript"),
    ),
  );
}

export async function sendCreditsPausedEmail(input: {
  to: string;
  bookTitle: string;
  projectId: string;
  balance: number;
  required: number;
}): Promise<void> {
  const url = `https://sopher.ai/studio/credits?return=${encodeURIComponent(
    `/projects/${input.projectId}/write`,
  )}`;
  await deliver(
    input.to,
    `Writing paused on “${input.bookTitle}”`,
    shell(
      "Writing is paused — out of credits.",
      p(
        `<em>${input.bookTitle}</em> needs about ${Math.ceil(input.required)} credits to continue and your balance is ${input.balance.toFixed(1)}. Every chapter drafted so far is safe; the book picks up exactly where it stopped once you top up.`,
      ) + cta(url, "Add credits and resume"),
    ),
  );
}

export async function sendReceiptEmail(input: {
  to: string;
  packName: string;
  credits: number;
  usd: number;
}): Promise<void> {
  await deliver(
    input.to,
    `Receipt — ${input.credits} credits`,
    shell(
      "Thanks — credits added.",
      p(
        `Your ${input.packName} purchase of <strong>${input.credits} credits</strong> ($${input.usd.toFixed(2)}) is on your balance now.`,
      ) + cta("https://sopher.ai/studio/credits", "View your balance"),
    ),
  );
}
