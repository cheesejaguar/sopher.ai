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

### Current topology (verified 2026-07-28)

Both instances already exist. `*.lcl.dev` is the placeholder name Clerk assigns
an instance that has no real domain attached — it does **not** imply
"development".

| Clerk environment | Instance domain | Frontend API | Status |
|---|---|---|---|
| Development | `actual.eagle-8.lcl.dev` | `actual-eagle-8.clerk.accounts.dev` | **what sopher.ai currently runs on** (`pk_test_`/`sk_test_`, instance `ins_3H6bP8akul1e7ulGjE737i7Pm6e`) |
| Production | `measured.rabbit-48.lcl.dev` | not yet serving TLS | created, **domain not yet set to `sopher.ai`** |

So the remaining task is not "create a production instance" — it is **change the
existing production instance's domain to `sopher.ai`**.

### Step 1 — configure the domain on the Vercel side

This Clerk account was provisioned through the **Vercel Marketplace**, so the
domain is Vercel-managed. Consequences:

- The Clerk dashboard shows the domain as *"managed by Vercel"* and will not let
  you edit it. `POST /v1/instance/change_domain` is likewise not the path here.
- Vercel shows *"Production domain required — your production deployment is
  currently using development keys. Configure a domain to start using Clerk's
  production environment."*
- **No CLI can do this.** `vercel integration` offers only add, accept-terms,
  balance, categories, discover, guide, installations, list, open, resource,
  update; `vercel integration resource` only connect, disconnect, remove,
  claim, create-threshold. None configure a resource's domain.

Configure it on the Clerk resource card in the Vercel dashboard (the card in
Installed Products showing "Production domain required"). `vercel integration
open clerk clerk-camel-basket` opens the resource dashboard via SSO.

> **Match the canonical domain.** Clerk provisions its subdomains under whatever
> production domain it is given, so `sopher.ai` yields `clerk.sopher.ai` while
> `www.sopher.ai` would yield `clerk.www.sopher.ai`. The project is configured
> apex-canonical (below) precisely so the existing DNS records apply.

Changing a Clerk domain regenerates the Publishable Key. Since the integration
owns that variable it re-syncs on its own — never copy a `pk_live_` by hand.

No downtime results: the live site keeps using the development instance until
the integration publishes production keys.

### Step 2 — DNS

The project is **apex-canonical** (set 2026-07-28): `sopher.ai` serves and
`www.sopher.ai` 308-redirects to it. It was previously the other way round,
which would have made Clerk provision under `www.` and stranded the records
already in place. If this is ever flipped back, the Clerk DNS records must move
with it.

```bash
# current state
curl -sI https://www.sopher.ai | head -1     # 308 -> https://sopher.ai/
curl -so /dev/null -w '%{http_code}\n' https://sopher.ai   # 200
```

sopher.ai is on Cloudflare nameservers. Every Clerk record must be
**DNS-only / grey cloud**; proxying them breaks Clerk.

Already in place and correct:

- `clerk.sopher.ai` CNAME → `frontend-api.clerk.services`
- `accounts.sopher.ai` CNAME → `accounts.clerk.services`

Still missing (email/DKIM — take the exact targets from the Domains page):
`clkmail`, `clk._domainkey`, `clk2._domainkey`.

Wait for the Domains page to show the domain and SSL certificates as verified.
DNS propagation can take up to 48h, though Cloudflare is usually minutes.

### Step 3 — the keys sync themselves; do not swap them by hand

`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` are **owned by the
Clerk marketplace resource**, not by us. Both carry
`contentHint.type = "integration-store-secret"` bound to resource
`clerk-camel-basket` (store `ir_hwgYOYUxHAiFtFmf`, integration
`oac_7uYNbc9CdDAZmNqbt3LEkO3a`) — the same ownership shape Neon's `DATABASE_URL`
has. They cannot be edited from the Vercel dashboard or CLI, and there is no
CLI command that remaps them: `vercel integration-resource` offers only
`connect`, `disconnect`, `remove`, `claim`, `create-threshold`.

Per Clerk's docs the mapping is automatic — *"Clerk's development instance maps
to Vercel's development and preview environments, and the production instance
maps to Vercel's production environment."*

Today both variables are a **single row targeting all three environments**
(`['production','preview','development']`) holding the development key, which is
why production serves `pk_test_`. That is the symptom of the production instance
not being fully provisioned. Completing step 1 (attaching `sopher.ai`) is what
lets Clerk publish `pk_live_`/`sk_live_` into the Production target on its own.

Verify the split appeared, then redeploy:

```bash
vercel env ls production        # CLERK_* rows should no longer span all 3 targets
vercel env pull /tmp/ck.txt --environment=production --yes
grep NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY /tmp/ck.txt | cut -d= -f2 | tr -d '"' \
  | sed 's/^pk_test_//;s/^pk_live_//' | base64 -d; echo   # expect sopher.ai
rm -f /tmp/ck.txt
```

**Fallback, only if Clerk never syncs production keys:** disconnect the resource
and take ownership of the variables manually. This breaks auth until the new
values are set, and gives up automatic key rotation — so treat it as a last
resort, not a shortcut.

```bash
vercel integration-resource disconnect clerk-camel-basket sopher-ai
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production
vercel env add CLERK_SECRET_KEY production
```

Also reconfigure on the production instance — these do **not** copy from
development: SSO/social connections, Integrations, and Paths. Any social
connection redirect URLs must be updated to the new domain.

Recommended: Clerk dashboard → webhook endpoint
`https://sopher.ai/api/webhooks/clerk`, subscribe to `user.created` +
`user.updated`, set `CLERK_WEBHOOK_SIGNING_SECRET` in Vercel.

### Step 4 — verify

```bash
curl -s "https://clerk.sopher.ai/v1/environment?__clerk_api_version=2021-02-05" | head -c 300
# expect JSON with display_config.instance_environment_type == "production"
```

Until the domain change lands, `clerk.sopher.ai` returns Cloudflare
**Error 1000 "DNS points to prohibited IP"**. That is expected and is *not* a
DNS mistake: Clerk sits behind Cloudflare, so Cloudflare only routes the
hostname once Clerk registers it as a custom hostname on their side. It clears
itself once step 1 completes.

### Known consequence: existing data is keyed to the development instance

Clerk does not share user records between environments, so signing in to the
production instance mints a **new** user id. `users.id` is the Clerk id, and
`projects.user_id` references it, so today's data would orphan:

| Clerk user id | Email | Owns |
|---|---|---|
| `user_3H6zLw7xAgKc7NqVOROUMGgZWkJ` | cheesejaguar@gmail.com | 1 project, 12 chapters |
| `dev-user` | dev@sopher.ai | — (local fallback) |

After the first production sign-in, re-point the row to the new id:

```sql
-- new_id = the user_... shown in the production instance's Users page
insert into users (id, email, name) values ('<new_id>', 'cheesejaguar@gmail.com', null)
  on conflict (id) do nothing;
update projects set user_id = '<new_id>' where user_id = 'user_3H6zLw7xAgKc7NqVOROUMGgZWkJ';
```

Or accept the loss — the existing project is the end-to-end test novel.

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
