import type { Metadata } from "next";

import { LegalPage } from "../legal-page";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "How refunds work for sopher.ai credits: unspent credits are not refundable, and what to do if a charge or a generation run went wrong.",
  alternates: { canonical: "/refunds" },
};

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" updated="July 29, 2026">
      <p>
        Credits are prepaid, and the honest thing is to be precise up front:{" "}
        <strong>all credit purchases are final</strong>.
      </p>

      <h2>All sales are final</h2>
      <p>
        Credits — spent or unspent — are not refundable. Before you buy, the pricing page shows
        exactly what a book costs, every account starts with free credits to try the product first,
        and every run shows its estimate before anything is charged. Where local consumer law grants
        you a mandatory withdrawal right, that law prevails.
      </p>

      <h2>Spent credits</h2>
      <p>
        Credits consumed by generation, editing, or image work paid for computation that already
        ran. This includes books you decide you do not like — AI output varies, and the estimate
        shown before each run is how we keep that risk visible up front.
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
