import { CREDIT_PACKS } from "@/lib/billing/credits-shared";
import { PUBLIC_BOOK_COST_RANGE } from "@/lib/billing/public-pricing";
import { FAQS, PIPELINE_STEPS } from "@/components/marketing/content";
import { SITE_URL } from "@/components/seo/json-ld";
import { GENRE_PAGES } from "@/lib/marketing/genre-pages";
import { GUIDES } from "@/lib/marketing/guides";
import {
  FULL_BOOK_UNLOCK_DESCRIPTION,
  INCLUDED_STORY_DESCRIPTION,
  INCLUDED_STORY_OFFER,
  INCLUDED_STORY_WAVE_DESCRIPTION,
} from "@/lib/marketing/trial-offer";

/**
 * /llms.txt — the convention answer engines and agents look for when they want
 * a compact, authoritative statement of what a site is, instead of inferring it
 * from marketing HTML.
 *
 * A route handler rather than a file in public/ so it is built from the same
 * constants as the pages. A hand-maintained llms.txt goes stale the first time
 * pricing changes, and stale is worse than absent: it gets quoted.
 */

function body(): string {
  const packs = CREDIT_PACKS.map(
    (p) =>
      `- ${p.name}: $${p.usd} for ${p.credits} credits${p.bonus > 0 ? ` (${Math.round(p.bonus * 100)}% bonus)` : ""}`,
  ).join("\n");

  const steps = PIPELINE_STEPS.map(
    (s) => `${Number(s.num)}. **${s.name}** — ${s.description}`,
  ).join("\n");

  const faqs = FAQS.map((f) => `### ${f.question}\n\n${f.answer}`).join("\n\n");

  const genrePages = GENRE_PAGES.map(
    (g) => `- [${g.name}](${SITE_URL}/genres/${g.slug}): ${g.description}`,
  ).join("\n");

  const guidePages = GUIDES.map(
    (g) => `- [${g.title}](${SITE_URL}/guides/${g.slug}): ${g.standfirst}`,
  ).join("\n");

  return `# sopher.ai

> The book in your head, finally on the page. Describe it in your own words and sopher.ai plans, drafts, and edits a complete manuscript you can shape and export.

## What it is

sopher.ai is a web application for writing complete books with AI. The author
writes a brief (one sentence is enough) and chooses the creative direction.
The included story has a fixed chapter count, target length, and quality. For
full-length books, the author can also choose chapter count, target length, and
quality. A pipeline of specialized agents produces the manuscript.

It is not a chatbot and not a single-prompt generator. Each stage is a distinct
agent with its own tools and its own review pass, and the author can intervene
at any point: approve or revise the outline before drafting, rewrite any
passage, regenerate a chapter, or edit the prose directly.

## How a book gets written

${steps}

Chapters are drafted in coordinated waves while the shared outline and story
bible keep the manuscript coordinated. ${INCLUDED_STORY_WAVE_DESCRIPTION}

## What it costs

Credits, not a subscription. One credit is one dollar of writing. Credits are
spent only on work that actually runs, and every book comes with a report of
where they went.

${INCLUDED_STORY_OFFER}. ${INCLUDED_STORY_DESCRIPTION}

${FULL_BOOK_UNLOCK_DESCRIPTION}

${packs}

A finished novella typically runs about ${PUBLIC_BOOK_COST_RANGE} credits depending on the quality
tier chosen. Purchased credits do not expire; unspent credits are not refundable.

## Who owns the output

The author. The brief is theirs and so is the resulting manuscript — it can be
exported (EPUB, PDF, DOCX, Markdown) and published anywhere, commercially or
otherwise.

## Common questions

${faqs}

## Pages

- [Home](${SITE_URL}/): what sopher.ai does, with a live sample of the prose
- [Pricing](${SITE_URL}/pricing): credit packs, per-book cost by tier, FAQ
- [Terms](${SITE_URL}/terms): terms of service
- [Privacy](${SITE_URL}/privacy): what is collected and who processes it
- [Refunds](${SITE_URL}/refunds): refund policy

### Genres

${genrePages}

### Guides

${guidePages}

## Contact

support@sopher.ai
`;
}

export function GET() {
  return new Response(body(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
