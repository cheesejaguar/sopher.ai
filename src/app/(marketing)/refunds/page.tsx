import type { Metadata } from "next";

import { LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "How refunds work for sopher.ai credits.",
};

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" updated="July 29, 2026">
      <p>Credits are prepaid, and the honest thing is to be precise about when money comes back.</p>

      <h2>Unspent credits</h2>
      <p>
        Credits you have purchased but not spent are refundable at face value (excluding any bonus
        credits) within <strong>14 days</strong> of purchase — email{" "}
        <a href="mailto:support@sopher.ai">support@sopher.ai</a> from your account address. Refunds
        go back to the original payment method via Stripe, usually within 5–10 business days.
      </p>

      <h2>Spent credits</h2>
      <p>
        Credits consumed by generation, editing, or image work paid for computation that already
        ran, and are not refundable. This includes books you decide you do not like — AI output
        varies, and the estimate shown before each run is how we keep that risk visible up front.
      </p>

      <h2>Failures on our side</h2>
      <p>
        If a run fails because of a fault in the Service — a crash, a bug, an outage — the credits
        it consumed are restored. If writing pauses because your balance ran out, nothing is lost:
        the run resumes where it stopped after a top-up.
      </p>

      <h2>The welcome grant</h2>
      <p>Free welcome credits have no cash value and are not refundable or transferable.</p>

      <h2>Chargebacks</h2>
      <p>
        If something looks wrong on your statement, contact us first — we can almost always resolve
        it faster than a dispute. Accounts that charge back legitimately spent credits may be
        suspended.
      </p>
    </LegalPage>
  );
}
