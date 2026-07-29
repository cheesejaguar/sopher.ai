import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

import { badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CREDIT_PACKS, SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits-shared";
import { cn } from "@/lib/utils";

/**
 * Marketing pricing, driven by the same CREDIT_PACKS the checkout sells — the
 * page can never drift from what the product actually charges again.
 */

/** What a finished book costs in credits, by tier. Mirrors doc/PRICING.md. */
const BOOK_COSTS = [
  { tier: "Draft", credits: "~21", blurb: "fast single pass" },
  { tier: "Standard", credits: "~27", blurb: "critiqued and edited" },
  { tier: "Premium", credits: "~36", blurb: "best prose model, deep edit" },
];

const PACK_TAGLINES: Record<string, string> = {
  starter: "Try a full book.",
  author: "A couple of books, edited properly.",
  studio: "For a season of writing.",
  press: "Best rate — a shelf of books.",
};

export function Pricing({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  return (
    <section id="pricing" aria-labelledby="pricing-heading">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 sm:py-32">
        <div className="max-w-2xl">
          <p className="font-mono text-xs tracking-[0.2em] text-primary uppercase">Pricing</p>
          <Heading
            id="pricing-heading"
            className="mt-3 font-display text-3xl font-semibold tracking-tight text-balance sm:text-4xl"
          >
            Credits, not subscriptions
          </Heading>
          <p className="mt-4 text-muted-foreground">
            One credit is one dollar of writing. You only spend credits on work that actually runs —
            drafting, editing, diagrams, portraits — and every book comes with a full report of
            where they went.
          </p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-ai-soft px-3 py-1.5 text-sm text-ai">
            <Sparkles aria-hidden="true" className="size-3.5" />
            New accounts start with {SIGNUP_GRANT_CREDITS} free credits
          </p>
        </div>

        <div
          role="list"
          aria-label="Credit packs"
          className="mt-12 grid items-stretch gap-6 sm:grid-cols-2 xl:grid-cols-4"
        >
          {CREDIT_PACKS.map((pack) => (
            <Card
              key={pack.id}
              role="listitem"
              className={cn(pack.id === "author" && "ring-2 ring-primary")}
            >
              <CardHeader>
                {/* The ring is decoration; the badge is what says "Recommended". */}
                <CardTitle
                  role="heading"
                  aria-level={headingLevel + 1}
                  className="flex items-center gap-2"
                >
                  {pack.name}
                  {pack.id === "author" ? (
                    <span className={cn(badgeVariants())}>Recommended</span>
                  ) : null}
                </CardTitle>
                <CardDescription>{PACK_TAGLINES[pack.id]}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-5">
                <p>
                  <span className="font-mono text-4xl font-semibold tracking-tight">
                    ${pack.usd}
                  </span>
                </p>
                <ul className="flex flex-col gap-2.5">
                  <li className="flex gap-2.5">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{pack.credits} credits</span>
                      {pack.bonus > 0 ? ` — ${Math.round(pack.bonus * 100)}% bonus` : ""}
                    </span>
                  </li>
                  <li className="flex gap-2.5">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">Credits never expire</span>
                  </li>
                  <li className="flex gap-2.5">
                    <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      Writing pauses safely if you run out — never lost work
                    </span>
                  </li>
                </ul>
                <Link
                  href="/studio/credits"
                  className={cn(
                    buttonVariants({ variant: pack.id === "author" ? "default" : "outline" }),
                    "mt-auto w-full",
                  )}
                >
                  Get {pack.name}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-10 rounded-xl border bg-card p-5">
          <h3 className="font-sans text-sm font-semibold">What does a book cost?</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            {BOOK_COSTS.map((row) => (
              <div key={row.tier} className="flex items-baseline gap-2">
                <dt className="text-sm text-muted-foreground">{row.tier}</dt>
                <dd className="font-mono text-sm tabular-nums">
                  {row.credits} cr{" "}
                  <span className="font-sans text-xs text-muted-foreground">({row.blurb})</span>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Figures for a ~36,000-word novella including light editing, from real production runs.
            Longer books cost proportionally more; you always see an estimate before writing starts.
          </p>
        </div>
      </div>
    </section>
  );
}
