# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

sopher.ai turns an author's brief into a complete, edited manuscript. A single
Next.js 16 app on Vercel: AI SDK v7 agents route through the Vercel AI Gateway,
long-running book generation is a durable Workflow DevKit workflow, data lives
in Neon Postgres via Drizzle, files in Vercel Blob, auth is Clerk.

## Commands

```bash
pnpm dev                 # dev server (port 3000 is often taken → 3001; check output)
pnpm build               # production build (Turbopack, cacheComponents)
pnpm typecheck           # tsc --noEmit
pnpm lint                # ESLint 9 flat config
pnpm test                # Vitest unit tests
pnpm format              # Prettier
pnpm db:generate         # drizzle-kit generate (after schema.ts changes)
pnpm db:migrate          # apply migrations (loads .env.local via dotenv)
pnpm db:studio           # Drizzle Studio
vercel env pull .env.local --yes   # refresh env + OIDC token (~24h TTL)
```

All quality gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Architecture

- `src/ai/models.ts` — the ONLY place gateway model slugs live (sonnet-5 /
  opus-5 / haiku-4.5 tiers). `src/lib/billing/pricing.ts` mirrors gateway
  pricing; verify both against `https://ai-gateway.vercel.sh/v1/models` when
  changing models.
- `src/ai/metering.ts` — every LLM call goes through `metered()` (budget
  pre-check + llm_calls row) with `gatewayOptions()` (per-user attribution,
  tags, `caching: "auto"`). `src/ai/cache.ts#anthropicCachedSystem` marks
  book-static system prompts as Anthropic cache breakpoints — keep those
  prompts byte-identical within a run.
- `src/ai/agents/` — phase-pipeline agents (chapter-writer is the pattern:
  plan → tool-using draft → critique → targeted revise). Tools are
  Postgres-backed, per-role, in `src/ai/tools/index.ts`.
- `src/ai/prompts/`, `src/ai/knowledge/`, `src/ai/analysis/` — ported domain
  assets (agent prompts, literary review rubric, plot/genre/voice libraries,
  free quality heuristics). Preserve their content; they are the product.
- `src/workflows/generate-book.ts` + `steps.ts` — the durable DAG (concept →
  outline → optional approval hook → chapter waves of 4 → editorial gate →
  continuity → bounded revision). Orchestration only in `"use workflow"`;
  all real logic in `"use step"` functions.
- `src/lib/run-events.ts` — the zod NDJSON event contract between workflow
  and UI. Namespace `progress` = RunEvent stream; `chapter:{n}` = prose deltas.
  Resumable via `?startIndex=`.
- `src/db/schema.ts` — Drizzle schema; content is first-class text columns.
  Migrations checked into `drizzle/`; Vercel build runs them (`vercel-build`).
- Design system: `src/app/globals.css`. Color roles are semantic — indigo =
  user/brand, teal (`ai`) = AI presence only, ember = cost/warnings only,
  `paper` tokens = manuscript surfaces (`.prose-manuscript`). Both themes must
  pass WCAG AA; token utilities only, never raw colors.

## Conventions

- AI SDK v7: `instructions` (not `system`), `isStepCount` (not `stepCountIs`),
  structured output via `output: Output.object({schema})` → `result.output`,
  usage aggregates across steps, cached tokens in
  `usage.inputTokenDetails.cacheReadTokens`.
- Next 16 + cacheComponents: `params`/`searchParams` are Promises; no
  `Date.now()` in server components before uncached data access (use
  `RelativeTime`); Suspense-wrap `usePathname`/`useSearchParams` consumers
  (see `stage-nav.tsx`); `proxy.ts` not middleware.ts.
- Route handlers: `requireUser()` (dev-user fallback until Clerk keys exist) +
  zod parse + ownership check. Server actions for mutations; route handlers
  only for streams/webhooks/downloads.
- `_port/` holds legacy source being referenced during the rebuild — excluded
  from tsconfig/eslint; delete when porting is fully done.

## Deployment

Vercel Git integration: push → preview, merge to `main` → production.
Project `sopher-ai` (team cheesejaguar-2353s-projects), region iad1, Node 24.
Ops via Vercel MCP (`get_deployment_build_logs`, `get_runtime_errors`) or CLI.
Workflow runs: `npx workflow inspect runs --backend vercel --project sopher-ai
--team cheesejaguar-2353s-projects`.

Known local quirk: `@workflow/vitest`'s in-process runner fails on a
builtin-modules JSON import — verify workflows through `pnpm dev` + routes
instead (see `vitest.integration.config.ts`).
