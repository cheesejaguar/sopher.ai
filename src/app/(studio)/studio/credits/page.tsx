import { PackButtons } from "@/components/credits/pack-buttons";
import { RelativeTime } from "@/components/relative-time";
import { PageHeader } from "@/components/studio/product-primitives";
import { requireUser } from "@/lib/auth";
import { CREDIT_PACKS, getBalance, listLedger } from "@/lib/billing/credits";
import { safeInternalPath } from "@/lib/security/url";

export const metadata = { title: "Credits" };

const KIND_LABELS: Record<string, string> = {
  purchase: "Purchase",
  usage: "Usage",
  refund: "Refund",
  grant: "Grant",
  adjustment: "Adjustment",
};

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ purchase?: string; return?: string }>;
}) {
  const { purchase, return: returnTo } = await searchParams;
  // Only ever navigate back inside the app. The old startsWith pair accepted
  // "/\evil.com", which browsers normalize to "//evil.com" — an off-site link
  // rendered on a signed-in page right after a payment.
  const safeReturn = safeInternalPath(returnTo);
  const { userId } = await requireUser();
  const [balance, ledger] = await Promise.all([getBalance(userId), listLedger(userId)]);

  return (
    <div className="space-y-8">
      <PageHeader
        label="Account / Credits"
        title="Credits"
        description="Credits are the studio’s working balance. See the quote before generation, then pay only for what actually runs."
      />

      {purchase === "complete" ? (
        <p
          role="status"
          className="rounded-md border border-ai/40 bg-ai-soft px-4 py-3 text-sm text-ai"
        >
          Payment received. Credits appear here once Stripe confirms the charge — usually within a
          few seconds. Refresh if the balance below looks unchanged.
          {safeReturn ? (
            <>
              {" "}
              <a href={safeReturn} className="font-medium underline">
                Back to your book
              </a>
            </>
          ) : null}
        </p>
      ) : null}
      {purchase === "cancelled" ? (
        <p role="status" className="rounded-md border border-border px-4 py-3 text-sm">
          Checkout cancelled. Nothing was charged.
        </p>
      ) : null}

      <section aria-labelledby="balance-heading" className="manuscript-sheet px-6 py-6">
        <h2
          id="balance-heading"
          className="font-mono text-xs tracking-[0.16em] text-paper-muted uppercase"
        >
          Balance
        </h2>
        <p className="mt-1 font-display text-4xl font-semibold tabular-nums text-paper-foreground">
          {balance.toFixed(2)}
          <span className="ml-2 font-sans text-base font-normal text-paper-muted">credits</span>
        </p>
      </section>

      <section aria-labelledby="packs-heading" className="space-y-4">
        <h2 id="packs-heading" className="font-sans font-semibold">
          Add credits
        </h2>
        <PackButtons packs={CREDIT_PACKS} returnTo={safeReturn ?? undefined} />
      </section>

      <section aria-labelledby="ledger-heading" className="space-y-3">
        <h2 id="ledger-heading" className="font-sans font-semibold">
          Activity
        </h2>
        {ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <div
            role="region"
            aria-label="Credit activity"
            tabIndex={0}
            className="max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <table className="w-full text-sm">
              <caption className="sr-only">Credit purchases and usage, most recent first</caption>
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-3 font-medium text-muted-foreground">
                    When
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium text-muted-foreground">
                    Type
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium text-muted-foreground">
                    Detail
                  </th>
                  <th scope="col" className="py-2 text-right font-medium text-muted-foreground">
                    Credits
                  </th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => {
                  const amount = Number(entry.amount);
                  return (
                    <tr key={entry.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                        <RelativeTime iso={entry.createdAt.toISOString()} />
                      </td>
                      <td className="py-2 pr-3">{KIND_LABELS[entry.kind] ?? entry.kind}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{entry.description}</td>
                      <td
                        className={`py-2 text-right tabular-nums ${amount < 0 ? "text-muted-foreground" : "text-ai"}`}
                      >
                        {amount > 0 ? "+" : ""}
                        {amount.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
