import { Check } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { CREDIT_PACKS, type CreditPack } from "@/lib/billing/credits-shared";
import { PUBLIC_BOOK_WORDS, PUBLIC_TIER_COST_ROWS } from "@/lib/billing/public-pricing";
import { INCLUDED_STORY_DESCRIPTION, INCLUDED_STORY_OFFER } from "@/lib/marketing/trial-offer";
import { cn } from "@/lib/utils";

/**
 * Marketing pricing is driven by the same CREDIT_PACKS the checkout sells.
 * Keeping the offer here structural rather than decorative makes the actual
 * amounts, bonus and limits the visual hierarchy.
 */

const PACK_TAGLINES: Record<string, string> = {
  starter: "Try a full book.",
  author: "A couple of books, edited properly.",
  studio: "For a season of writing.",
  press: "Best rate — a shelf of books.",
};

function PackOffer({
  pack,
  featured,
  headingLevel,
}: {
  pack: CreditPack;
  featured?: boolean;
  headingLevel: 1 | 2;
}) {
  const PackHeading = headingLevel === 1 ? "h2" : "h3";

  return (
    <article
      className={cn(
        "relative flex h-full flex-col border border-black/10 bg-black/[0.018] p-5 dark:border-white/12 dark:bg-white/[0.025] sm:p-6",
        featured && "border-primary bg-primary/[0.045] dark:bg-primary/[0.07]",
      )}
    >
      <p
        className={cn(
          "folio-label mb-7 min-h-[0.85rem]",
          featured ? "w-fit border-l border-ion pl-2 text-ion" : "text-muted-foreground",
        )}
      >
        {featured ? "Recommended" : "Credit pack"}
      </p>
      <div className="flex items-start justify-between gap-5">
        <div>
          <PackHeading className="font-display text-2xl font-semibold tracking-[-0.03em]">
            {pack.name}
          </PackHeading>
          <p className="mt-1 text-sm text-muted-foreground">{PACK_TAGLINES[pack.id]}</p>
        </div>
        <p className="shrink-0 font-mono text-3xl font-semibold tracking-[-0.04em] tabular-nums sm:text-4xl">
          ${pack.usd}
        </p>
      </div>

      <div className="mt-7 h-px bg-black/10 dark:bg-white/10" />
      <ul className="mt-6 flex flex-col gap-3">
        <li className="flex gap-3">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="text-sm leading-6 text-muted-foreground">
            <span className="font-medium text-foreground">{pack.credits} credits</span>
            {pack.bonus > 0 ? ` — ${Math.round(pack.bonus * 100)}% bonus` : ""}
          </span>
        </li>
        <li className="flex gap-3">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="text-sm leading-6 text-muted-foreground">Credits never expire</span>
        </li>
        <li className="flex gap-3">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="text-sm leading-6 text-muted-foreground">
            Writing pauses safely if you run out — never lost work
          </span>
        </li>
      </ul>
      <a
        href="/studio/credits"
        className={cn(
          buttonVariants({ variant: featured ? "default" : "outline" }),
          "mt-8 min-h-11 w-full rounded-sm",
        )}
      >
        Get {pack.name}
      </a>
    </article>
  );
}

export function Pricing({ headingLevel = 2 }: { headingLevel?: 1 | 2 }) {
  const Heading = headingLevel === 1 ? "h1" : "h2";
  // Shifts with the section heading. /pricing must keep h1 -> h2, while the
  // homepage nests pack headings below its h2.
  const SubHeading = headingLevel === 1 ? "h2" : "h3";
  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="border-b border-black/10 dark:border-white/10"
    >
      <div className="mx-auto w-full max-w-7xl px-6 py-24 lg:px-8 lg:py-32">
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <p className="folio-label text-primary">Credits / no subscription</p>
            <Heading
              id="pricing-heading"
              className="mt-5 max-w-3xl font-display text-4xl font-semibold leading-[1.02] tracking-[-0.04em] text-balance sm:text-5xl"
            >
              Credits, not subscriptions
            </Heading>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-muted-foreground">
              One credit is one dollar of writing. You only spend credits on work that actually runs
              — drafting, editing, diagrams, portraits — and every book comes with a full report of
              where they went.
            </p>
            <div className="mt-7 border-l border-ion pl-4">
              <p className="text-sm font-semibold text-ion">{INCLUDED_STORY_OFFER}</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                {INCLUDED_STORY_DESCRIPTION}
              </p>
            </div>
          </div>

          <div className="border-t border-black/10 pt-5 dark:border-white/10 lg:col-span-5">
            <SubHeading className="font-display text-xl font-semibold tracking-[-0.025em]">
              What does a book cost?
            </SubHeading>
            <dl className="mt-5 divide-y divide-black/10 border-b border-black/10 dark:divide-white/10 dark:border-white/10">
              {PUBLIC_TIER_COST_ROWS.map((row) => (
                <div key={row.tier} className="grid grid-cols-[1fr_auto] gap-3 py-3">
                  <dt className="text-sm text-muted-foreground">
                    {row.tier}
                    <span className="block text-xs">{row.blurb}</span>
                  </dt>
                  <dd className="font-mono text-sm tabular-nums">~{row.credits} cr</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Illustrative figures for a ~{PUBLIC_BOOK_WORDS.toLocaleString("en-US")}-word novella
              including light editing. Longer books cost proportionally more; you always see an
              estimate before writing starts.
            </p>
          </div>
        </div>

        <div className="mt-14 flex items-end justify-between gap-5 border-b border-black/10 pb-4 dark:border-white/10">
          <div>
            <p className="folio-label text-muted-foreground">After your included story</p>
            <SubHeading className="mt-2 font-display text-2xl font-semibold tracking-[-0.03em]">
              Choose a credit pack
            </SubHeading>
          </div>
          <p className="hidden max-w-md text-right text-sm leading-6 text-muted-foreground md:block">
            A settled purchase permanently unlocks full-length book controls. Credits never expire.
          </p>
        </div>
        <ul aria-label="Credit packs" className="mt-5 grid gap-4 md:grid-cols-2">
          {CREDIT_PACKS.map((pack) => (
            <li key={pack.id}>
              <PackOffer pack={pack} featured={pack.id === "author"} headingLevel={headingLevel} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
