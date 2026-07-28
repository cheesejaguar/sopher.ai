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

### Step 1 — point the production instance at sopher.ai

Per Clerk's docs you can change the primary domain of a production instance
(but never a development one — that field is permanently read-only, which is
why it cannot be edited on the Development tab).

- **Dashboard**: switch the environment selector to **Production**, then go to
  the [Domains page](https://dashboard.clerk.com/~/domains) and change the
  primary domain to `sopher.ai`.
- **Or Backend API**, using the production (`sk_live_`) secret key:

  ```bash
  curl -XPOST -H 'Authorization: <sk_live_...>' -H 'Content-type: application/json' \
    -d '{"home_url":"https://sopher.ai"}' \
    'https://api.clerk.com/v1/instance/change_domain'
  ```

> **Changing the domain regenerates the Publishable Key.** Clerk will fail to
> load if the app keeps using the old one, so always re-copy `pk_live_` from the
> dashboard *after* this step — not before.

This causes no downtime on the live site, because the live site is still
authenticating against the development instance until step 3.

### Step 2 — DNS

sopher.ai is on Cloudflare nameservers. Every Clerk record must be
**DNS-only / grey cloud**; proxying them breaks Clerk.

Already in place and correct:

- `clerk.sopher.ai` CNAME → `frontend-api.clerk.services`
- `accounts.sopher.ai` CNAME → `accounts.clerk.services`

Still missing (email/DKIM — take the exact targets from the Domains page):
`clkmail`, `clk._domainkey`, `clk2._domainkey`.

Wait for the Domains page to show the domain and SSL certificates as verified.
DNS propagation can take up to 48h, though Cloudflare is usually minutes.

### Step 3 — swap the keys and redeploy

Production environment only:

```bash
vercel env rm NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production --yes
vercel env add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY production   # new pk_live_...
vercel env rm CLERK_SECRET_KEY production --yes
vercel env add CLERK_SECRET_KEY production                    # sk_live_...
```

Then redeploy (any push to `main`, or `vercel redeploy`).

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
