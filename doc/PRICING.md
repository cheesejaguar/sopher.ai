# Pricing and unit economics

Derived from production data, not estimates. Every LLM call is metered into
`llm_calls`; the figures below come from two complete books.

## Measured cost of a book

| Tier | Chapters | Words | Generation | + light editing (+50%) | Per 1k words |
|---|---|---|---|---|---|
| standard | 12 | 36,588 | $6.39 | **$9.58** | $0.262 |
| premium | 10 | 36,816 | $8.61 | **$12.91** | $0.351 |
| draft *(derived)* | — | — | $4.95 | **$7.43** | ~$0.203 |

Draft has never run in production — its figure is derived by removing the editor
pass and most continuity phases from the standard book. Re-derive it after the
first real draft-tier run.

Largest cost line in both books is the writer (54% / 56%). The second-largest
differs entirely by tier: continuity on standard, editor on premium.

## Why the original price list was withdrawn

The rebuild plan assumed draft ≈ $2.60, standard ≈ $4.70, premium ≈ $10.70 and
priced for 74–79% margins. Measured against real COGS:

| Tier | Old price | Real COGS | Margin |
|---|---|---|---|
| draft | $9.99 | $7.43 | **19.2%** |
| standard | $19.99 | $9.58 | **47.2%** |
| premium | $49.99 | $12.91 | 70.2% |

The structural fault is compression: COGS spans $5.48 while the price list spans
$40. The tiers were priced as if they differed five-fold in cost; they differ by
less than two-fold.

## The model: prepaid credits at 2.75× metered cost

One credit is one dollar of retail value. Work is debited at
`CREDIT_MARKUP` (`src/lib/billing/credits.ts`) times its metered cost.

A multiplier rather than a fixed per-book price because:

- **Editing becomes revenue.** The +50% editing uplift is real metered usage.
  Under a fixed price it erodes margin; under credits the author pays for it.
- **Runaway generations stop being losses.** Three revision passes debit three
  revision passes.
- **Provider price changes pass through**, so margin holds as rates move.

| Tier | Generate | Light edit | Finished book |
|---|---|---|---|
| draft | 14 cr | 7 cr | 21 cr |
| standard | 18 cr | 9 cr | 27 cr |
| premium | 24 cr | 12 cr | 36 cr |

### Packs

| Pack | Price | Credits | Bonus | Worst-case margin |
|---|---|---|---|---|
| Starter | $25 | 25 | — | 59.0% |
| Author | $60 | 66 | 10% | 56.1% |
| Studio | $120 | 138 | 15% | 54.5% |
| Press | $300 | 360 | 20% | 52.9% |

Worst case assumes every credit is spent. Unspent credits are pure margin.
`credits.test.ts` asserts every pack stays above 50% at current rates and above
35% if model prices rose 25%.

## Operating costs

| Line | Monthly |
|---|---|
| Vercel Pro | $20 + ~$0.10/book |
| Neon | $0 → $19 |
| Clerk | $0 below 10k MAU |
| Blob | ~$3 |
| Domain (.ai) | ~$7.50 |
| Tooling | ~$15 |
| **Fixed total** | **$45.50** |

AI Gateway is passthrough at list price with zero markup — it is COGS, already
counted per book. Sales tax/VAT is handled by Stripe Tax at ~0.5% of volume;
income tax should be reserved at 21–30% of net.

Break-even is **3 books/month** for fixed costs, **33 books/month** with $500 of
marketing.

## Two open cost levers

1. **Prompt cache is at 31.7%**, against a 50–60% design target — 1.37M cached
   against 2.95M billed input tokens. The writer role, the largest cost line,
   shows 310k cached against 638k billed.
2. **Continuity variance is unexplained**: $1.95 on one book versus $0.54 on a
   comparable one, the expensive run consuming 1.06M input tokens. If continuity
   reads full prose rather than summaries on some paths, that is recoverable.

At 2.75× markup every dollar saved in COGS is $2.75 of headroom.

## Caveats

- Both measured books are ~36k-word novellas. Nothing here is validated for
  full-length novels.
- Draft-tier COGS is derived, not measured.
- The Stripe resource is provisioned as a **sandbox** (test mode). Claim it with
  `vercel integration resource claim sopher-payments` before taking real money.
