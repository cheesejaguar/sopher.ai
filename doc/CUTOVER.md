# Production runbook

Status 2026-07-28: the rebuild is **live** — https://sopher.ai serves the new
app (Vercel project `sopher-ai`, team `cheesejaguar-2353s-projects`, deploys
via Git integration from `main`). Completed: Clerk + Neon + Blob provisioning,
AI Gateway credits (haiku tier active), production merge (#103), auth-gate fix
(#111), domain attachment, and a full end-to-end book generated and exported
on the shipped pipeline.

Two operator steps remain.

## 1. Clerk production instance (when you want branded auth)

Sign-in currently runs on a Clerk **development** instance — fully functional,
but Clerk-branded URLs, dev-mode session limits, and a "development" watermark
on the widget.

### Read this first: the domain field is not editable

A development instance's domain is a Clerk-assigned name like
`actual.eagle-8.lcl.dev` (its Frontend API is the matching
`actual-eagle-8.clerk.accounts.dev`). Per Clerk's docs, you can change the
primary domain of a **production** instance but **not** a development one — the
field is read-only and will never read `sopher.ai`. There is no settings page
where you rename it. The domain is entered *once*, as an input inside the
create-production-instance flow. Do not go looking for it anywhere else.

### Confirm you are in the right application first

The deployed app authenticates against instance
`ins_3H6bP8akul1e7ulGjE737i7Pm6e`, whose development domain is
`actual.eagle-8.lcl.dev`. There is at least one other Clerk application on this
account (`measured.rabbit-48.lcl.dev`) — work done there produces keys that
match nothing. Verify which app you are in before touching anything:

```bash
# decode the publishable key currently deployed -> shows the instance domain
vercel env pull /tmp/ck.txt --environment=production --yes
grep NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY /tmp/ck.txt | cut -d= -f2 | tr -d '"' \
  | sed 's/^pk_test_//;s/^pk_live_//' | base64 -d; echo
# authoritative: ask the instance about itself
curl -s -H "Authorization: Bearer $(grep '^CLERK_SECRET_KEY' /tmp/ck.txt | cut -d= -f2- | tr -d '"')" \
  https://api.clerk.com/v1/instance
rm -f /tmp/ck.txt
```

### Steps

1. Clerk dashboard → select the application whose development instance is
   `actual.eagle-8.lcl.dev`.
2. Click the environment dropdown at the top that reads **Development** →
   **Create production instance**. Choose "clone settings from development".
   SSO connections, Integrations, and Paths do *not* clone — reconfigure them.
3. Enter `sopher.ai` as the domain **in that creation flow**. Clerk then lists
   the DNS records to add.
4. Add the records in Cloudflare (sopher.ai runs on Cloudflare nameservers).
   All Clerk records must be **DNS-only / grey cloud**, never proxied.
   Already in place and correct:
   - `clerk.sopher.ai` CNAME → `frontend-api.clerk.services`
   - `accounts.sopher.ai` CNAME → `accounts.clerk.services`

   Still missing (email/DKIM — Clerk gives the exact targets):
   `clkmail`, `clk._domainkey`, `clk2._domainkey`.
5. Copy the production keys into Vercel (production environment only):
   `vercel env rm ... production` then `vercel env add ... production`, for
   `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (pk_live/sk_live).
6. Optional but recommended: Clerk dashboard → webhook endpoint
   `https://sopher.ai/api/webhooks/clerk`, subscribe to `user.created` +
   `user.updated`, set `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel.
7. Redeploy (or push any commit); verify `/studio` redirects through
   `clerk.sopher.ai` rather than `*.accounts.dev`.

### Verifying, and one expected red herring

Until the production instance exists, `https://clerk.sopher.ai` returns
Cloudflare **Error 1000 "DNS points to prohibited IP"**. This does *not* mean
the DNS is wrong. Clerk sits behind Cloudflare, so Cloudflare only routes
`clerk.sopher.ai` once Clerk has registered it as a custom hostname on their
side — which happens when the production instance is created. The error clears
on its own at that point. Green means:

```bash
curl -s "https://clerk.sopher.ai/v1/environment?__clerk_api_version=2021-02-05" | head -c 200
# expect JSON with display_config.instance_environment_type == "production"
```

To change the domain *later* (production instances only):

```bash
curl -XPOST -H 'Authorization: <sk_live_...>' -H 'Content-type: application/json' \
  -d '{"home_url":"https://sopher.ai"}' \
  'https://api.clerk.com/v1/instance/change_domain'
```

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
