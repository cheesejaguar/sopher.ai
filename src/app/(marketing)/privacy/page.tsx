import type { Metadata } from "next";

import { LegalPage } from "../legal-page";
import { publicPageMetadata } from "@/lib/marketing/public-metadata";

export const metadata: Metadata = publicPageMetadata({
  title: "Privacy Policy",
  description:
    "What sopher.ai collects and why, who processes it, how long it is kept, and what happens to the manuscripts you write.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="August 2, 2026">
      <p>
        This policy explains what we collect when you use sopher.ai, why we collect it, and what
        control you have over it. The short version: we collect what the product needs to work, your
        manuscripts are private unless you deliberately create a reader link, and we do not sell
        data.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account data</strong> — your name, email address, and avatar, from the sign-in
          provider you choose. Authentication is operated by Clerk.
        </li>
        <li>
          <strong>Your writing</strong> — briefs, outlines, manuscripts, story-bible entries, and
          edits, stored so you can return to them.
        </li>
        <li>
          <strong>Usage metering</strong> — a record of each AI model call your account makes
          (model, token counts, cost) so we can show you exactly what you spent. This record
          contains counts, not the text of your book.
        </li>
        <li>
          <strong>Payment records</strong> — handled by Stripe. We store the transaction reference
          and credit amount; we never see or store card numbers.
        </li>
      </ul>

      <h2>Who processes it</h2>
      <ul>
        <li>
          <strong>AI model providers</strong> (currently Anthropic and Google, via Vercel&rsquo;s AI
          Gateway) receive your brief and manuscript text to generate and edit your book, under
          terms that do not permit training on your content.
        </li>
        <li>
          <strong>Infrastructure</strong> — Vercel (hosting, file storage), Neon (database), Clerk
          (authentication), Stripe (payments).
        </li>
        <li>
          <strong>Google Analytics</strong> — anonymous usage measurement (pages visited, rough
          location, device type), so we can see what to improve. It never receives your manuscripts
          or account content.
        </li>
      </ul>
      <p>
        We do not sell personal data, run third-party advertising trackers, or share your
        manuscripts with anyone except the processors above, as needed to run the Service, and the
        people you deliberately invite through a reader link.
      </p>

      <h2>Reader links</h2>
      <p>
        If you create a reader link, we capture an immutable edition of the manuscript and make it
        available to anyone who has that secret link until it expires or you revoke it. Reader pages
        carry search-engine exclusion directives, do not run marketing analytics, and do not create
        or update attribution cookies. A recipient can still copy, print, save, or redistribute what
        they can read. The secret stays in the browser-only fragment of the shared URL and is
        exchanged for a scoped, HttpOnly reader-session cookie. Our database stores a one-way
        fingerprint, not the bearer secret. After creation you can revoke a link but cannot ask us
        to reveal it again. Revocation disables the reader page and optional download; it cannot
        recall copies a recipient already made.
      </p>

      <h2>Cookies</h2>
      <p>
        We use cookies for sign-in sessions (set by Clerk), reader sessions opened from a deliberate
        secret link, your theme preference, Google Analytics measurement (the <code>_ga</code>{" "}
        family), and two first-party cookies of our own: <code>sopher_aid</code>, a random
        identifier that lets us count a visit as one visit, and <code>sopher_attr</code>, which
        records how you first arrived (a campaign tag or referring site) so we know which channels
        are worth continuing. Neither contains personal information, and the referring site is
        stored as a domain only, never a full address. There are no advertising cookies. You can
        block analytics cookies in your browser or with Google&rsquo;s{" "}
        <a href="https://tools.google.com/dlpage/gaoptout">opt-out add-on</a> without affecting the
        product.
      </p>
      <p>
        We also record which steps of the book wizard you reach, and when a book is started,
        finished, or exported. This is product measurement — how far people get and where they get
        stuck — and it is never joined to the contents of what you write.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Your content is kept while your account exists. We may review content when required to
        enforce our terms or comply with law; such review is limited to that purpose. Deleting a
        project removes its manuscript, story bible, reader editions, reader links, and generated
        files. Deleting your account removes your account record and all projects; transaction
        records are retained as required for tax and accounting. To delete your account, use your
        account menu or email us.
      </p>

      <h2>Your rights</h2>
      <p>
        You can export your manuscripts at any time from the product. Depending on where you live
        you may have additional rights (access, correction, deletion, portability) — email{" "}
        <a href="mailto:support@sopher.ai">support@sopher.ai</a> and we will honor them.
      </p>

      <h2>Changes</h2>
      <p>
        Material changes to this policy will be posted here with a new &ldquo;last updated&rdquo;
        date.
      </p>
    </LegalPage>
  );
}
