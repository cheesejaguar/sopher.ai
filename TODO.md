# TODO

Tracking for the Vercel-native rebuild (shipped to production 2026-07-27,
PRs #103/#111/#112). Items are checked only with all associated tests passing.

## Rebuild — complete

Verification for every checked item: `pnpm typecheck && pnpm lint && pnpm test`
green (255/255 unit tests, 19 files), `pnpm build` green, CI + CodeQL green on
main, plus the live end-to-end run described below.

- [x] Demolish legacy FastAPI/GKE/Docker stack; scaffold Next.js 16 app
- [x] Vercel project settings, Neon + Clerk + Blob integrations, AI Gateway via OIDC
- [x] Dual-theme design system, static marketing landing, studio shells
- [x] Data layer (Drizzle, 15 tables, build-time migrations), billing meter, projects CRUD
- [x] AI spike: prompt caching through gateway (verified: 4,454 cached tokens re-read),
      AI SDK v7 tool loop + structured output, Workflow DevKit runtime
- [x] Port domain assets to TypeScript (prompts, review rubric, plot/genre/voice
      libraries, quality heuristics) — 101 dedicated unit tests
- [x] Agentic pipeline: Postgres-backed per-role tools; chapter writer with
      plan → tool-using draft → critique → targeted revise; concept/outline/
      editor/continuity agents
- [x] Durable generate-book workflow: budget gate, outline-approval hook,
      parallel chapter waves, editorial gate, continuity review, revision pass
- [x] Brief wizard with live per-tier cost receipts; dashboard on real data
- [x] Generation experience: resumable NDJSON streams, live prose, agent feed,
      cost ticker, approval flow, failure/retry and completion states
- [x] Web editor: TipTap, anchored accept/reject AI suggestions, autosave with
      conflict handling, content tools (Mermaid diagram, image generation)
- [x] Manuscript reading view; DOCX/EPUB/PDF/MD export workflows to Blob
- [x] Usage dashboards with cached-token accounting
- [x] CI swap (lean check + CodeQL + dependabot), prettier gate
- [x] Ship: merged to main, https://sopher.ai serving the new app, auth gate
      verified (Clerk handshake), zero runtime errors post-fix

Live E2E evidence (2026-07-27): generated "The Arithmetic of Mercy" — 12
chapters, 36,428 words — through the production codebase: wizard → approval-
gated durable run → live streaming → selection edit accepted transactionally →
in-document Mermaid figure → valid EPUB + 115-page PDF exports → $6.39 across
109 metered calls reconciled on the usage page (50-60% cached input tokens).

## Blocked on operator actions (not completable from code)

- [x] Top up AI Gateway credits — done by the operator 2026-07-27 (verified:
      haiku-4.5 responds through the gateway). Cheap tier restored to
      `anthropic/claude-haiku-4.5` in `src/ai/models.ts` and
      `src/ai/estimate.ts` recalibrated against the real `llm_calls` data from
      the first production book (12×3,000 words now quotes ≈ $1.05 draft /
      $1.73 standard / $3.09 premium, ~34-40 min). Estimator unit tests added;
      268/268 unit tests + 12/12 E2E green.
- [ ] Create a Clerk production instance for sopher.ai (Clerk dashboard + DNS
      records on the domain — operator-owned); sign-in currently runs on the
      dev instance.
- [ ] After a soak week (from 2026-07-27): tear down the GKE cluster and revoke
      legacy GCP secrets (steps in doc/CUTOVER.md). Deliberately time-gated —
      do not automate.

## Nice-to-have (post-launch) — complete

- [x] Playwright E2E suite in CI: dual-theme projects over marketing, auth,
      wizard, and (DB-gated) studio surfaces with strict axe-core checks and
      screenshot artifacts — 12/12 locally with `E2E_DB=1`, 8/8 in the no-DB
      CI mode. Surfaced and fixed real WCAG AA contrast failures (dark primary
      buttons now indigo-with-ink, light muted text darkened, tab triggers
      raised to 70% ink) — zero serious/critical axe findings across five
      surfaces in both themes; `/pricing` gained its `h1`.
- [x] Per-phase checkpointing inside the continuity review: one workflow step
      per rubric phase + a pure aggregate step (`aggregateContinuityOutcomes`
      unit-tested for weighting, dedupe, worst-chapter ranking) — a retry
      replays finished phases from checkpoints instead of re-billing them.
- [x] Resume failed full-book runs from completed chapters:
      `writeChapterStep` reuses chapters with real prose (`isChapterComplete`
      unit-tested); crashed mid-draft chapters regenerate.
