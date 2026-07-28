# sopher.ai

[![CI](https://github.com/cheesejaguar/sopher.ai/actions/workflows/ci.yml/badge.svg)](https://github.com/cheesejaguar/sopher.ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Your brief. A finished book.** sopher.ai turns an author's brief into a
complete, edited manuscript — drafted, critiqued, and continuity-checked by a
team of AI agents while you watch it happen, then refined in a suggestion-based
web editor.

## How it works

A durable server-side workflow runs the pipeline end to end:

1. **Concept** expands the brief and seeds a character bible
2. **Outliner** structures the book against a real plot template (Three-Act,
   Hero's Journey, Save the Cat, …) — optionally pausing for your approval
3. **Chapter Writers** draft in parallel waves; each one plans its scenes,
   consults the character bible and story-so-far memory mid-draft via tools,
   self-critiques against measured heuristics, and revises the flagged spans
4. **Editor** makes a light-touch pass where the quality gate calls for it
5. **Continuity** reviews the manuscript on a six-dimension weighted literary
   rubric and files issues; the worst chapters get targeted revision

Every model call is metered (tokens, cache hits, dollars) with per-user
budgets, model tiering (Draft / Standard / Premium), and Anthropic prompt
caching — a 60k-word book costs a few dollars, not tens.

## Stack

Next.js 16 (App Router, PPR) · AI SDK v7 + Vercel AI Gateway
(claude-sonnet-5 / claude-opus-5 / claude-haiku-4.5) · Vercel Workflow DevKit ·
Neon Postgres + Drizzle · Clerk · Vercel Blob · Tailwind v4 + shadcn/ui ·
TipTap editor · deployed on Vercel.

## Development

```bash
pnpm install
vercel link && vercel env pull .env.local --yes   # Neon, Blob, AI Gateway (OIDC)
pnpm db:migrate
pnpm dev
```

Quality gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

See `CLAUDE.md` for architecture notes and conventions.

## License

MIT
