# sopher.ai

[![CI](https://github.com/cheesejaguar/sopher.ai/actions/workflows/ci.yml/badge.svg)](https://github.com/cheesejaguar/sopher.ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Production](https://sopher.ai) · [Pricing](https://sopher.ai/pricing) ·
[Genres](https://sopher.ai/genres) · [Writing guides](https://sopher.ai/guides)

**The book in your head, finally on the page.**

sopher.ai is a production web application for turning a short author brief into a complete,
editable manuscript. A durable team of specialized AI agents develops the concept, creates the
outline, drafts the chapters, edits the prose, and checks continuity while the author follows the
work and controls the important decisions.

It is built for everyday storytellers beginning with an idea—not only experienced authors—and is
fully usable on desktop, tablet, and phone.

## What is live

### An included short story

Every eligible verified account can create one complete short story without a card. The included
experience is a server-enforced production shape:

- 3 chapters with a target of 1,000 words per chapter
- Standard quality and one-chapter drafting waves
- Required outline approval before prose is drafted
- The complete Studio, Story Bible, editor, manuscript reader, and export toolset

This is an included product experience rather than an unrestricted credit giveaway. A settled
credit purchase permanently unlocks full-length chapter count, length, and quality controls. The
author can carry the included story's title, genre, and brief into a new full-book setup without
changing or losing the original story.

### Full-length books

Full books support Draft, Standard, and Premium quality tiers, configurable chapter count and
length, optional outline approval, and coordinated drafting waves of up to four chapters. Authors
receive a project-specific credit estimate before production begins.

sopher.ai uses prepaid credits rather than a subscription. One credit is one dollar of writing;
credits are charged only for work that runs, purchased credits do not expire, and paid production
pauses safely at an authoring boundary if the available balance runs out. Current illustrative book
costs and credit packs live on the [pricing page](https://sopher.ai/pricing).

### A complete author workspace

- A four-step setup flow—Genre, Brief, Shape, Estimate—with a required working title, resumable
  drafts, creative controls, and a confirmed estimate.
- A project lifecycle organized as Plan, Produce, Refine, and Publish, with navigation location and
  live production state shown separately.
- One server-derived next action on every project surface, so an interrupted or partially completed
  book always has a truthful continuation path.
- A live production view with real workflow stage, percentage, chapter assembly, elapsed time,
  estimate, last update, agent activity, credit use, approvals, pauses, cancellation, and recovery.
- A structured Story Bible for characters, places, objects, and organizations, including generated
  portraits that can be viewed at full size.
- A full TipTap manuscript editor with autosave, stale-tab conflict handling, undo and redo, chapter
  history, find and replace, zen mode, suggestions, and selection-based writing and content tools.
- A responsive phone and tablet editor with accessible chapter, suggestion, history, search, and
  tool sheets instead of a desktop-only interstitial.
- A manuscript reader and consistent-snapshot exports to Markdown, Word/DOCX, EPUB, and PDF.
- Persistent Help, contextual first-use guidance, and an artifact-derived first-book checklist
  rather than a forced product tour.

Authors own the resulting manuscript and can edit, export, and publish it wherever they choose.

## How a book is written

The public workflow has five stages:

| Stage          | What it does                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Concept**    | Expands the author's brief into a premise, world, cast, and creative direction.                                  |
| **Outline**    | Builds a chapter-by-chapter structure with arcs, beats, and payoffs, then pauses for approval when configured.   |
| **Chapters**   | Plans, drafts, critiques, and revises chapters against the shared outline, Story Bible, and story-so-far memory. |
| **Editor**     | Makes targeted prose, pacing, voice, and quality improvements where the editorial gate calls for them.           |
| **Continuity** | Reviews the complete manuscript for contradictions in names, timelines, facts, and character details.            |

The pipeline is a durable Vercel Workflow rather than one long request. Starts, author inputs,
events, checkpoints, and finalization are idempotent. Saved work remains available through
reconnects and interruptions; ambiguous runs are preserved until authoritative evidence supports a
retry, recovery, cancellation, or failure state. A failed production is never automatically
restarted, and a purchase is never presented as the remedy for a product failure.

## Public site, accessibility, and SEO

The public site includes the homepage, pricing, seven genre libraries, five writing guides, and the
terms, privacy, and refund pages. Public content is server-rendered and paired with canonical
metadata, structured data, a [sitemap](https://sopher.ai/sitemap.xml),
[robots rules](https://sopher.ai/robots.txt), and generated [llms.txt](https://sopher.ai/llms.txt).
Private Studio, project, Admin, API, and authentication surfaces are excluded from indexing.

The interface is dark-first with a complete light theme and is designed and tested toward WCAG 2.2
AA. Acceptance coverage includes keyboard operation, visible focus, screen-reader semantics,
reduced motion, forced colors, 200–400% reflow, 44px mobile targets, and page-overflow checks from
320px through wide desktop. Essential content remains available without client-side JavaScript.

## Architecture

| Area                  | Implementation                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Application           | Next.js 16 App Router with Cache Components and typed routes, React 19, Tailwind CSS 4, Base UI, and shadcn |
| AI                    | AI SDK 7 through Vercel AI Gateway; model tiers and pricing are centralized in source                       |
| Orchestration         | Vercel Workflow with resumable NDJSON progress and chapter streams                                          |
| Data                  | Neon Postgres, Drizzle ORM, forward-only migrations, and Vercel Blob                                        |
| Identity and commerce | Clerk, Stripe, credit-ledger metering, and Resend transactional email                                       |
| Writing               | TipTap 3, versioned chapters and suggestions, Story Bible entities, and multi-format exports                |
| Quality               | TypeScript, ESLint, Prettier, Vitest, isolated-Neon integration tests, Playwright, axe, and Lighthouse CI   |

Important implementation boundaries:

- [`src/workflows/generate-book.ts`](src/workflows/generate-book.ts) — durable authoring workflow
- [`src/lib/authoring-journey.ts`](src/lib/authoring-journey.ts) — authoritative project state and
  next action
- [`src/lib/run-health.ts`](src/lib/run-health.ts) — Workflow-aware health and reconciliation
- [`src/lib/run-events.ts`](src/lib/run-events.ts) — progress-stream contract
- [`src/db/schema.ts`](src/db/schema.ts) — persisted product and reliability model
- [`src/components/editor/editor-shell.tsx`](src/components/editor/editor-shell.tsx) — responsive
  manuscript workbench
- [`src/lib/export`](src/lib/export) — Markdown, DOCX, EPUB, and PDF assembly

## Local development

Prerequisites: Node.js 24, pnpm 10.28.2 through Corepack, and access to the linked Vercel project.
The repository intentionally does not contain an `.env.example`; use the environment managed by
Vercel.

```bash
corepack enable
pnpm install --frozen-lockfile

vercel link
vercel env pull .env.local --yes

pnpm db:migrate
pnpm dev
```

Useful commands:

```bash
pnpm typecheck             # TypeScript without emitting files
pnpm lint                  # ESLint 9 flat configuration
pnpm format:check          # Prettier verification
pnpm test                  # Vitest unit suites
pnpm check:migrations      # SQL files and Drizzle journal integrity
pnpm db:check              # Drizzle schema/migration validation
pnpm build                 # Production Next.js build
pnpm test:e2e              # Playwright browser acceptance
pnpm lighthouse           # Mobile Lighthouse CI suite
```

Database-backed browser and transaction suites must run only against the allowlisted disposable
Neon acceptance branch with `E2E_DATABASE_ISOLATED=1`. See
[`.github/workflows/ci.yml`](.github/workflows/ci.yml) and
[`playwright.config.ts`](playwright.config.ts) rather than pointing those suites at a shared or
production database.

## Verification

CI separates fast checks, public browser acceptance, trusted isolated-database acceptance, and
Lighthouse so a public smoke test cannot be mistaken for authenticated product coverage. It runs:

- dependency audit, typecheck, lint, formatting, unit tests, migration integrity, and Drizzle checks
- production builds, Chromium tests in light and dark, and focused Firefox and WebKit smoke coverage
- real Neon transaction tests plus seeded authenticated Studio, project, editor, manuscript, and
  Admin browser tests
- accessibility, reduced-motion, reflow, keyboard, no-JavaScript, and horizontal-overflow assertions
- mobile Lighthouse runs on the homepage, pricing, and generation guide

Lighthouse uses the pessimistic result across two runs and enforces Performance ≥ 0.90,
Accessibility = 1.00, Best Practices ≥ 0.95, and SEO = 1.00.

## Deployment

[sopher.ai](https://sopher.ai) runs on Vercel with Node.js 24. Git integration creates preview
deployments for pull requests and deploys `main` to production. The production build applies the
forward-only Drizzle migration journal before compiling Next.js.

A signed five-minute reconciler checks active authoring runs, and the progress stream opts into
Vercel request cancellation. Current Workflow and runtime commands are documented in
[`CLAUDE.md`](CLAUDE.md).

## Repository documentation

- [`PRODUCT.md`](PRODUCT.md) — current product contract and evidence rules
- [`DESIGN.md`](DESIGN.md) — dark-first visual system and interaction principles
- [`CLAUDE.md`](CLAUDE.md) — engineering architecture and repository conventions
- [`docs/redesign`](docs/redesign/README.md) — synthetic production-mode redesign captures
- [`docs/trial-onboarding`](docs/trial-onboarding/README.md) — synthetic included-story journey
  captures

## Support and license

Product support: [support@sopher.ai](mailto:support@sopher.ai)

The source code is available under the [MIT License](LICENSE).
