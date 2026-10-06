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
    <LegalPage title="Privacy Policy" updated="August 12, 2026">
      <p>
        This policy is effective August 12, 2026. It explains what we collect when you use
        sopher.ai, why we collect it, and what control you have over it. The short version: we
        collect what the product needs to work, your manuscripts are private unless you deliberately
        create a reader link, and we do not sell or share personal data for cross-context behavioral
        advertising.
      </p>

      <h2>Who we are</h2>
      <p>
        sopher.ai operates this Service. For privacy questions, requests, or complaints, contact us
        at <a href="mailto:support@sopher.ai">support@sopher.ai</a>. If you send a request, we may
        ask for information needed to verify that you control the relevant account before we
        disclose or delete account information.
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
          contains accounting and usage metadata, not the text of your book.
        </li>
        <li>
          <strong>Product events</strong> — events such as wizard steps, starting or finishing a
          book, exporting, and applying an edit. Events may be associated with your account after
          sign-in; their properties are restricted to small scalar values and are not used to store
          manuscript text.
        </li>
        <li>
          <strong>Safety and support records</strong> — information needed to prevent abuse, enforce
          our terms, investigate service failures, handle support requests, and comply with law.
          This can include a limited excerpt or moderation record when a safety check requires one.
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
          <strong>Analytics providers</strong> — Google Analytics and Vercel Analytics measure
          public-page visits and performance so we can improve the site. They are not loaded on the
          authenticated Studio, admin, API, or reader-link routes, and they never receive your
          manuscript text.
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
        are worth continuing. Both are first-touch cookies and last for up to 90 days; the referring
        site is stored as a domain only, never a full address. Neither contains your manuscript.
        There are no advertising cookies. You can block analytics cookies in your browser or with
        Google&rsquo;s <a href="https://tools.google.com/dlpage/gaoptout">opt-out add-on</a> without
        affecting the product.
      </p>
      <p>
        We also record which steps of the book wizard you reach, and when a book is started,
        finished, or exported. This is product measurement — how far people get and where they get
        stuck — and it is never joined to the contents of what you write.
      </p>

      <h2>Retention and deletion</h2>
      <p>
        Your content is kept while your account exists. We may review content when required to
        enforce our terms, operate safety checks, or comply with law; such review is limited to that
        purpose. Deleting a project removes its manuscript, story bible, reader editions, reader
        links, and generated files. Expired or revoked reader snapshots are eligible for cleanup
        after 30 days. Deleting your account removes your account record and all projects;
        transaction records are retained as required for tax and accounting. To delete your account,
        use your account menu or email us. Some backups or fraud-prevention records may persist for
        a limited period before their normal secure deletion cycle.
      </p>

      <h2>Security and international processing</h2>
      <p>
        We use authentication, scoped access controls, secure transport, project-level ownership
        checks, and operational safeguards designed to protect your information. No internet service
        can guarantee absolute security, so do not use sopher.ai to store information that requires
        a specialized regulated system. sopher.ai and the processors listed above may process
        information in countries other than where you live. Where applicable, we use the contractual
        or other safeguards required for those transfers.
      </p>

      <h2>Children</h2>
      <p>
        The Service is not directed to children under 13, and we do not knowingly collect personal
        information from children under 13. If you believe a child has provided personal
        information, contact us so we can investigate and remove it where appropriate.
      </p>

      <h2>Your rights</h2>
      <p>
        You can export your manuscripts at any time from the product. Depending on where you live,
        you may have rights to access, correct, delete, restrict, object to, or receive a portable
        copy of your personal information, and to withdraw consent where processing relies on
        consent. You may also have the right to opt out of sale or sharing; we do not sell personal
        data or share it for cross-context behavioral advertising. Email{" "}
        <a href="mailto:support@sopher.ai">support@sopher.ai</a> to exercise a right. We will not
        discriminate against you for making a lawful privacy request, subject to applicable legal
        exceptions and verification requirements.
      </p>

      <h2>Third-party links</h2>
      <p>
        The Service may link to third-party sites or services. Their privacy practices are governed
        by their own notices, not this policy. Review those notices before providing information.
      </p>

      <h2>Changes</h2>
      <p>
        Material changes to this policy will be posted here with a new &ldquo;last updated&rdquo;
        date.
      </p>
    </LegalPage>
  );
}
