import Link from "next/link";
import { Check } from "lucide-react";

import { badgeVariants } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tier = {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  cta: string;
  recommended?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Draft",
    price: "$9.99",
    tagline: "A fast single-pass draft.",
    features: [
      "Fast, capable writing model for every chapter",
      "Single drafting pass — no editorial rewrite",
      "Automated continuity scan",
      "Full manuscript export",
    ],
    cta: "Start with Draft",
  },
  {
    name: "Standard",
    price: "$19.99",
    tagline: "Drafted, critiqued, and edited.",
    features: [
      "Stronger writing model, tuned for fiction",
      "Editor agent critiques and rewrites every chapter",
      "Full continuity review across the book",
      "Suggestion-based editor to refine the result",
    ],
    cta: "Start with Standard",
    recommended: true,
  },
  {
    name: "Premium",
    price: "$49.99",
    tagline: "Our best prose model plus a full editorial pass.",
    features: [
      "Our best prose model, end to end",
      "Deep editorial pass — structure, pacing, and line edits",
      "Continuity sweeps before and after editing",
      "Priority generation queue",
    ],
    cta: "Start with Premium",
  },
];

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
            Pay per book, not per month
          </Heading>
          <p className="mt-4 text-muted-foreground">
            Three quality tiers, one price each. Every book comes with a full cost report, so you
            can see what each agent spent.
          </p>
        </div>

        <div
          role="list"
          aria-label="Quality tiers"
          className="mt-12 grid items-stretch gap-6 md:grid-cols-3"
        >
          {TIERS.map((tier) => (
            <Card
              key={tier.name}
              role="listitem"
              className={cn(tier.recommended && "ring-2 ring-primary")}
            >
              <CardHeader>
                {/* The ring around the Standard tier is decoration; the badge is
                    what actually says "Recommended" to everyone. */}
                <CardTitle
                  role="heading"
                  aria-level={headingLevel + 1}
                  className="flex items-center gap-2"
                >
                  {tier.name}
                  {tier.recommended ? (
                    <span className={cn(badgeVariants())}>Recommended</span>
                  ) : null}
                </CardTitle>
                <CardDescription>{tier.tagline}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-6">
                <p>
                  <span className="font-mono text-4xl font-semibold tracking-tight">
                    {tier.price}
                  </span>{" "}
                  <span className="text-sm text-muted-foreground">per book</span>
                </p>
                <ul className="flex flex-col gap-2.5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5">
                      <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/studio"
                  className={cn(
                    buttonVariants({
                      variant: tier.recommended ? "default" : "outline",
                    }),
                    "mt-auto w-full",
                  )}
                >
                  {tier.cta}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Early access pricing — pay per book, no subscription. Prices may shift as we tune the
          model mix.
        </p>
      </div>
    </section>
  );
}
