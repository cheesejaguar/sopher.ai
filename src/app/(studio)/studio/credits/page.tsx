import type { Route } from "next";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { PackButtons } from "@/components/credits/pack-buttons";
import { PurchaseReturnStatus } from "@/components/credits/purchase-return-status";
import { RelativeTime } from "@/components/relative-time";
import { PageHeader } from "@/components/studio/product-primitives";
import { requireUser } from "@/lib/auth";
import { CREDIT_PACKS, getBalance, listLedger } from "@/lib/billing/credits";
import {
  FULL_BOOK_UNLOCK_DESCRIPTION,
  INCLUDED_STORY_NO_CARD_NOTE,
} from "@/lib/marketing/trial-offer";
import { safeInternalPath } from "@/lib/security/url";
import { getStudioAccess } from "@/lib/studio-access";
import {
  creditReturnRunId,
  creditReturnWithoutRun,
  creditReturnWithRun,
} from "@/lib/credit-return";
import { checkoutSessionId, hasOwnedSettledCheckout } from "@/lib/payments/checkout-return";

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
  searchParams: Promise<{
    purchase?: string;
    return?: string;
    resumeRun?: string;
    needed?: string;
    session_id?: string;
  }>;
}) {
  const {
    purchase,
    return: returnTo,
    resumeRun,
    needed,
    session_id: returnedSessionId,
  } = await searchParams;
  // Only ever navigate back inside the app. The old startsWith pair accepted
  // "/\evil.com", which browsers normalize to "//evil.com" — an off-site link
  // rendered on a signed-in page right after a payment.
  const safeReturn = safeInternalPath(returnTo);
  const { userId } = await requireUser();
  const resumeRunId = creditReturnRunId(resumeRun, safeReturn);
  const purchaseSessionId = purchase === "complete" ? checkoutSessionId(returnedSessionId) : null;
  const checkoutReturnTo =
    safeReturn && resumeRunId ? creditReturnWithRun(safeReturn, resumeRunId) : safeReturn;
  const [balance, ledger, access, resumeRows, purchaseConfirmed] = await Promise.all([
    getBalance(userId),
    listLedger(userId),
    getStudioAccess(userId),
    resumeRunId
      ? getDb()
          .select({
            id: schema.generationRuns.id,
            status: schema.generationRuns.status,
            pauseKind: schema.generationRuns.pauseKind,
            pauseDetails: schema.generationRuns.pauseDetails,
            cancellationRequestedAt: schema.generationRuns.cancellationRequestedAt,
          })
          .from(schema.generationRuns)
          .where(
            and(
              eq(schema.generationRuns.id, resumeRunId),
              eq(schema.generationRuns.userId, userId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
    hasOwnedSettledCheckout({ userId, sessionId: purchaseSessionId }),
  ]);
  const resumeRow = resumeRows[0];
  const resumeRequiredCredits =
    resumeRow?.status === "awaiting_input" &&
    resumeRow.pauseKind === "credits_topup" &&
    resumeRow.cancellationRequestedAt === null &&
    typeof resumeRow.pauseDetails?.requiredCredits === "number" &&
    Number.isFinite(resumeRow.pauseDetails.requiredCredits)
      ? resumeRow.pauseDetails.requiredCredits
      : null;
  const resumeNoLongerNeeded =
    resumeRunId !== null &&
    !(
      resumeRow?.status === "awaiting_input" &&
      resumeRow.pauseKind === "credits_topup" &&
      resumeRow.cancellationRequestedAt === null
    );
  const requestedNeeded = Number(needed);
  const preflightNeeded =
    Number.isFinite(requestedNeeded) && requestedNeeded > 0 && requestedNeeded <= 10_000
      ? requestedNeeded
      : null;
  const recommendedCredits =
    resumeRequiredCredits !== null
      ? Math.max(0, resumeRequiredCredits - balance)
      : (preflightNeeded ?? undefined);
  const showFullBookUnlock = !access.fullBookUnlocked;
  const resolvedReturnTo =
    resumeNoLongerNeeded && safeReturn ? creditReturnWithoutRun(safeReturn) : checkoutReturnTo;
  const continueTo = (resolvedReturnTo ?? "/studio/new") as Route;
  const visibleLedger = access.fullBookUnlocked
    ? ledger
    : ledger.filter((entry) => entry.kind !== "grant");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Credits"
        description="Credits are the studio’s working balance. See the quote before generation, then pay only for what actually runs."
      />

      {purchase === "complete" ? (
        <PurchaseReturnStatus
          purchaseConfirmed={purchaseConfirmed}
          continueTo={continueTo}
          resumeRunId={resumeRunId}
          resumeReady={resumeRequiredCredits !== null && balance >= resumeRequiredCredits}
          resumeNoLongerNeeded={resumeNoLongerNeeded}
          balance={balance}
          requiredCredits={resumeRequiredCredits}
        />
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
          {access.fullBookUnlocked ? "Balance" : "Included experience"}
        </h2>
        {access.fullBookUnlocked ? (
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums text-paper-foreground">
            {balance.toFixed(2)}
            <span className="ml-2 font-sans text-base font-normal text-paper-muted">credits</span>
          </p>
        ) : (
          <>
            <p className="mt-2 font-display text-2xl font-semibold text-paper-foreground">
              {access.trialProjectId ? "Your short story is covered." : "Full-length books locked"}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-paper-muted">
              {access.trialProjectId
                ? "The included story uses an internal allowance, not a public credit balance. No card is required to complete it."
                : "Choose a credit pack below to permanently unlock full-length production."}
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="packs-heading" className="space-y-4">
        <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="packs-heading" className="font-sans font-semibold">
              {showFullBookUnlock ? "Unlock full-length books" : "Add credits"}
            </h2>
            {showFullBookUnlock ? (
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {INCLUDED_STORY_NO_CARD_NOTE} {FULL_BOOK_UNLOCK_DESCRIPTION} Credits never expire
                and are used only for work that actually runs.
              </p>
            ) : null}
          </div>
          {showFullBookUnlock ? (
            <p className="folio-label shrink-0 text-ai">The included story stays included</p>
          ) : null}
        </div>
        <PackButtons
          packs={CREDIT_PACKS}
          returnTo={resolvedReturnTo ?? undefined}
          unlockingFullBook={showFullBookUnlock}
          recommendedCredits={recommendedCredits}
          suspended={access.suspended}
        />
      </section>

      <section aria-labelledby="ledger-heading" className="space-y-3">
        <h2 id="ledger-heading" className="font-sans font-semibold">
          Activity
        </h2>
        {visibleLedger.length === 0 ? (
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
                {visibleLedger.map((entry) => {
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
