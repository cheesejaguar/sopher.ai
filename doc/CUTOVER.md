# Production runbook

Status 2026-07-28: the rebuild is **live** — https://sopher.ai serves the new
app (Vercel project `sopher-ai`, team `cheesejaguar-2353s-projects`, deploys
via Git integration from `main`). Completed: Clerk + Neon + Blob provisioning,
AI Gateway credits (haiku tier active), production merge (#103), auth-gate fix
(#111), domain attachment, and a full end-to-end book generated and exported
on the shipped pipeline.

One operator step remains (GKE teardown); Clerk production auth is done.

## 1. Clerk production auth — DONE 2026-07-28

`https://sopher.ai` now authenticates against a Clerk **production** instance
on its own domain. Verified: the live page loads
`https://clerk.sopher.ai/npm/@clerk/clerk-js@6/...`, the production
publishable key is `pk_live_` decoding to `clerk.sopher.ai`, and
`/v1/instance` reports `environment_type: production`.

| | |
|---|---|
| Resource | `sopher-ai` (`ir_w3QjAAUbAONgHuO9`), metadata `{"domain":"sopher.ai"}` |
| Clerk app | `app_3H9AzE6yUQ0gCgm14RIgl7nUyG6` |
| Prod instance | `ins_3H9AzC8FBbLeKBPFW9JFOa7aiIA` — domain `sopher.ai` |
| Dev instance | `fluent.snake-62.lcl.dev` → Preview + Development |
| Deleted | old resource `clerk-camel-basket` / app `app_3H6bP5BDzHMZLyN2XrbLPV5TIxd` |

Env vars are integration-owned and correctly split: Production carries the
`pk_live_`/`sk_live_` pair, Preview+Development the `pk_test_` pair.

### What actually blocked this, and the traps

**The domain is a create-only field.** The original resource was provisioned
with `metadata: {}`, and Vercel's product schema marks `domain` as
`"ui:readonly": "update"` — settable *only* at creation. Neither dashboard, CLI,
nor REST API can add it afterwards (`PATCH
/v1/storage/stores/integration/{id}` rejects both `{"domain":…}` and
`{"metadata":{"domain":…}}`). The fix was to recreate the resource. Everything
else — Clerk showing "managed by Vercel", the production instance sitting on a
`.lcl.dev` placeholder, production serving `pk_test_` — followed from that one
empty field.

**Remove the old resource first.** Installing the new one while
`clerk-camel-basket` still held `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` /
`CLERK_SECRET_KEY` made Vercel fall back to a `PROD_` prefix
(`NEXT_PUBLIC_PROD_CLERK_PUBLISHABLE_KEY`), which the app does not read. Fix:

```bash
vercel integration-resource remove clerk-camel-basket -y -a
vercel integration-resource disconnect <new-resource> -y -a
vercel integration-resource connect <new-resource> sopher-ai -y \
  -e production -e preview -e development     # no --prefix
```

**`vercel redeploy` will not pick up new `NEXT_PUBLIC_*` values.** Those are
inlined at build time and the build cache restores the old ones. Use
`vercel --prod --force`.

**The `Clerk DNS Configuration` deploy check lags reality.** It kept failing
after all five CNAMEs resolved and `clerk.sopher.ai` returned 200. Bypass with
`vercel promote <deployment-url>`; reversible via `vercel rollback`.

### Two false alarms — do not chase these

- `curl https://accounts.sopher.ai` returns **403 with `cf-mitigated:
  challenge`** ("Just a moment..."). That is a Cloudflare bot challenge, not a
  provisioning failure. Browsers pass it.
- `curl https://sopher.ai/studio` returns **404**. Clerk's `auth.protect()`
  answers non-document requests that way. A real navigation
  (`Accept: text/html`) gets `307 → /sign-in?redirect_url=…`, which is correct.

### DNS (all five present and verified, DNS-only / grey cloud)

| Host | Target |
|---|---|
| `clerk.sopher.ai` | `frontend-api.clerk.services` |
| `accounts.sopher.ai` | `accounts.clerk.services` |
| `clkmail.sopher.ai` | `mail.y3qj9ha93smv.clerk.services` |
| `clk._domainkey.sopher.ai` | `dkim1.y3qj9ha93smv.clerk.services` |
| `clk2._domainkey.sopher.ai` | `dkim2.y3qj9ha93smv.clerk.services` |

The project is **apex-canonical** (changed 2026-07-28): `sopher.ai` serves,
`www.sopher.ai` 308-redirects to it. It was previously reversed, which would
have made Clerk provision under `www.` and stranded these records. If it is ever
flipped back, these move with it.

### Remaining: reparent the sample project after first sign-in

Clerk does not share users across instances, and the new production instance
currently has **0 users**. The existing 12-chapter book is owned by `dev-user`
(the dev fallback identity), not by any Clerk account:

| Owner | Email | Projects |
|---|---|---|
| `dev-user` | dev@sopher.ai | 1 (12 chapters) |
| `user_3H6zLw7xAgKc7NqVOROUMGgZWkJ` | cheesejaguar@gmail.com | 0 (stale, old instance) |

After signing up on `https://sopher.ai`, move it across:

```sql
-- new_id = the user_... from the production instance's Users page
update projects set user_id = '<new_id>' where user_id = 'dev-user';
delete from users where id = 'user_3H6zLw7xAgKc7NqVOROUMGgZWkJ';  -- optional cleanup
```

Optional hardening: Clerk dashboard → webhook `https://sopher.ai/api/webhooks/clerk`,
events `user.created` + `user.updated`, then set `CLERK_WEBHOOK_SIGNING_SECRET`
(the current value belongs to the deleted app and is stale).

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
