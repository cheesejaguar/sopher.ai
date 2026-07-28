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

### Root cause — the domain is a create-only field that was never set

This Clerk account came from the **Vercel Marketplace**, so its domain is
Vercel-managed. The resource was provisioned with `metadata: {}` — no domain —
and Vercel's product schema declares:

```json
"domain": {
  "ui:label": "Production domain (optional)",
  "ui:readonly": "update",
  "ui:control": "domain"
}
```

`ui:readonly: "update"` means the field is settable **only at resource
creation**. Verified consequences:

- Clerk's dashboard shows the domain as *"managed by Vercel"* and will not edit
  it; `POST /v1/instance/change_domain` does not apply to managed resources.
- Vercel's *"Production domain required"* notice is a tooltip, not a control.
- The REST API refuses it too. `PATCH /v1/storage/stores/integration/{id}`
  accepts an empty body but rejects both `{"domain":…}` and
  `{"metadata":{"domain":…}}` with *"should NOT have additional property"*.
- No CLI reaches it: `vercel integration` = add, accept-terms, balance,
  categories, discover, guide, installations, list, open, resource, update;
  `vercel integration resource` = connect, disconnect, remove, claim,
  create-threshold.

Everything downstream — the production instance stuck on a `.lcl.dev`
placeholder, production serving `pk_test_` — follows from that one empty field.
The only fix inside the Marketplace is to **recreate the resource with the
domain set during install**.

### Step 1 — recreate the Clerk resource with a domain

State being replaced (for reference/rollback):

| | |
|---|---|
| Resource | `clerk-camel-basket` (`ir_hwgYOYUxHAiFtFmf`) |
| Clerk app | `app_3H6bP5BDzHMZLyN2XrbLPV5TIxd` |
| Integration | `oac_7uYNbc9CdDAZmNqbt3LEkO3a`, config `icfg_2xSONU7uZ1l3PUqwrcUkiQd0` |
| Owns env vars | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (all 3 targets) |

Order matters — removing the resource deletes those env vars, so the site is
down until the new one is connected. Do it in one sitting.

1. Vercel dashboard → the `clerk-camel-basket` resource → **Remove**. (CLI
   equivalent: `vercel integration resource remove clerk-camel-basket`.)
2. Install Clerk again — `vercel integration add clerk`, or the dashboard's
   Marketplace flow. Both are interactive and need human confirmation.
3. **In the install form, fill "Production domain (optional)" with `sopher.ai`.**
   This is the entire point of the exercise and the one field that cannot be
   fixed later. Not `www.sopher.ai` — see the canonical-domain note in step 2.
4. Connect the resource to project `sopher-ai` for all three environments.

Clerk then provisions a production instance on `sopher.ai` and the integration
syncs `pk_live_`/`sk_live_` into the Production target itself. Never hand-copy
those keys; the integration owns them and would overwrite or reject the edit.

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
