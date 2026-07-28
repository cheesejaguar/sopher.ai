# Production runbook

Status 2026-07-28: the rebuild is **live** — https://sopher.ai serves the new
app (Vercel project `sopher-ai`, team `cheesejaguar-2353s-projects`, deploys
via Git integration from `main`). Completed: Clerk + Neon + Blob provisioning,
AI Gateway credits (haiku tier active), production merge (#103), auth-gate fix
(#111), domain attachment, and a full end-to-end book generated and exported
on the shipped pipeline.

Two operator steps remain.

## 1. Clerk production instance (when you want branded auth)

Sign-in currently runs on the Clerk **development** instance
(`actual-eagle-8.clerk.accounts.dev`) — fully functional, but Clerk-branded
URLs, dev-mode session limits, and a "development" watermark on the widget.

1. Clerk dashboard → the sopher.ai application → **Create production instance**
   (clone settings from development).
2. Set the production domain to `sopher.ai`; Clerk will list DNS records
   (CNAMEs such as `clerk.sopher.ai`, `accounts.sopher.ai`, plus email DKIM).
   Add them wherever sopher.ai's DNS lives (if the domain is on Vercel
   nameservers: `vercel dns add sopher.ai <name> CNAME <target>`).
3. Copy the production keys into Vercel (production environment only):
   `vercel env update NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production` and
   `vercel env update CLERK_SECRET_KEY production` (pk_live/sk_live values).
4. Optional but recommended: in the Clerk dashboard create a webhook endpoint
   → `https://sopher.ai/api/webhooks/clerk`, subscribe to `user.created` +
   `user.updated`, and set `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel.
5. Redeploy (or push any commit); verify `/studio` redirects through
   `clerk.sopher.ai` instead of `*.accounts.dev`.

## 2. Decommission the old GKE stack (after soak — no earlier than 2026-08-03)

Deliberately time-gated; do not automate.

- Delete the GKE cluster (namespace `sopher-ai`: api, web, in-cluster
  Postgres/Redis) and its ingress/load balancer.
- Delete `ghcr.io/cheesejaguar/sopher-{backend,frontend}` images.
- Revoke the old pipeline's GitHub repo secrets: `GCP_SA_KEY`, `GKE_CLUSTER`,
  `GKE_ZONE`, `GCP_PROJECT`, plus any legacy provider API keys.
- Remove the old `api.sopher.ai` DNS record once nothing references it.

## Notes

- No data migration was needed: the old in-cluster Postgres held prototype
  data only; the new system runs clean on Neon.
- Budgets default to $20/user/month (hard limit) — adjustable in
  Studio → Settings or the `budgets` table.
- Ops: `vercel logs`, the Vercel dashboard, or
  `npx workflow inspect runs --backend vercel --project sopher-ai --team
cheesejaguar-2353s-projects` for generation runs.
