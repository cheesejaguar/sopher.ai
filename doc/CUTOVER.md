# Production cutover runbook

The rebuild deploys from this repo via Vercel Git integration (project
`sopher-ai`, team `cheesejaguar-2353s-projects`). These steps are the ones only
you can do, in order.

## 1. Unblock the two pending integrations (do these first)

- **Clerk (auth)** — accept the marketplace terms at
  <https://vercel.com/cheesejaguar-2353s-projects/~/integrations/accept-terms/clerk>,
  then run `vercel integration add clerk` in the repo. That provisions
  `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; the app's auth
  gates activate automatically on the next deploy (until then previews run on
  a shared guest identity). Afterwards, add these env vars once:
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`,
  `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`, and (optionally, for user-sync
  reconciliation) create a webhook endpoint in the Clerk dashboard pointing at
  `https://<domain>/api/webhooks/clerk` and set
  `CLERK_WEBHOOK_SIGNING_SECRET`.
- **AI Gateway credits** — the free tier blocks `claude-haiku-4.5` (the cheap
  tier used for planning/summaries/line edits). Top up credits at
  Vercel → AI → Top up. Until then everything runs, but on sonnet-5 pricing.

## 2. Merge and verify production

1. Open a PR from `rebuild/vercel-platform` → `main`; merging deploys
   production to `sopher-ai.vercel.app`.
2. Smoke: sign in, create a project through the wizard, run a Draft-tier
   generation end to end, open the editor, accept one suggestion, export an
   EPUB, check Studio → Usage shows the metered spend.
3. Watch `vercel logs` / the Vercel dashboard for runtime errors; workflow
   runs are inspectable with
   `npx workflow inspect runs --backend vercel --project sopher-ai --team cheesejaguar-2353s-projects`.

## 3. Point sopher.ai at Vercel

1. Vercel dashboard → sopher-ai → Settings → Domains → add `sopher.ai` and
   `www.sopher.ai`. Complete verification while DNS still points at GKE.
2. At the registrar: apex `A` → `76.76.21.21`, `www` `CNAME` →
   `cname.vercel-dns.com` (or delegate to Vercel nameservers).
3. Wait for certificate issuance + propagation; the old GKE ingress keeps
   serving stale traffic during TTL, which is fine.

## 4. Decommission the old stack (after a soak week)

- Delete the GKE cluster (namespace `sopher-ai`: api, web, in-cluster
  Postgres/Redis) and its load balancer/ingress.
- Delete `ghcr.io/cheesejaguar/sopher-{backend,frontend}` images.
- Revoke the GitHub repo secrets from the old pipeline: `GCP_SA_KEY`,
  `GKE_CLUSTER`, `GKE_ZONE`, `GCP_PROJECT`, and the old provider API keys.
- The old `api.sopher.ai` DNS record can be removed once nothing references it.

## Notes

- No data migration: the old in-cluster Postgres held prototype data only; the
  new system starts clean on Neon.
- Budgets default to $20/user/month (hard limit) — adjustable per user in the
  `budgets` table or Studio → Settings.
