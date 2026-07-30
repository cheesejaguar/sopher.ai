import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getDb, schema } from "@/db";
import { grantCredits, reconcileCreditReservations } from "@/lib/billing/credits";
import { SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits-shared";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    // Clerk's adapter verifies the raw body and all Svix signature headers.
    event = await verifyWebhook(req);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "user.created" || event.type === "user.updated") {
    const { data } = event;
    const primaryEmail =
      data.email_addresses?.find((e) => e.id === data.primary_email_address_id)?.email_address ??
      data.email_addresses?.[0]?.email_address ??
      "";
    const name = [data.first_name, data.last_name].filter(Boolean).join(" ") || null;

    await getDb()
      .insert(schema.users)
      .values({ id: data.id, email: primaryEmail, name, imageUrl: data.image_url ?? null })
      .onConflictDoUpdate({
        target: schema.users.id,
        set: { email: primaryEmail, name, imageUrl: data.image_url ?? null, updatedAt: new Date() },
      });

    if (event.type === "user.created") {
      // Same idempotency key as the lazy path in requireUser — whichever runs
      // second no-ops on the unique external_ref index.
      await grantCredits({
        userId: data.id,
        credits: SIGNUP_GRANT_CREDITS,
        description: "Welcome credits",
        externalRef: `signup:${data.id}`,
        kind: "grant",
      });
    }
  }

  if (event.type === "user.deleted") {
    const userId = event.data.id;
    if (!userId) return Response.json({ received: true, deleted: false });

    // A deleted Clerk identity cannot initiate new work. Release any holds
    // whose conservative expiry/terminal grace already proves them abandoned
    // before taking the final locked snapshot below.
    await reconcileCreditReservations(userId);

    const outcome = await getDb().transaction(async (tx) => {
      // Lock the parent row first. PostgreSQL foreign-key inserts need a
      // conflicting key-share lock, so once this returns no new project can
      // appear outside the cleanup snapshot.
      const [lockedUser] = await tx
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .for("update")
        .limit(1);
      if (!lockedUser) return "already_deleted" as const;

      const projectRows = await tx
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.userId, userId))
        .orderBy(asc(schema.projects.id));

      // Match the established project -> wallet lock order. Sorting makes
      // duplicate webhook deliveries and administrative cleanup deadlock-safe.
      for (const project of projectRows) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(
            hashtextextended('sopher:project-authoring:' || ${project.id}, 0)
          )`,
        );
      }
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${userId}, 0))`);

      const [activeRun] = await tx
        .select({ id: schema.generationRuns.id })
        .from(schema.generationRuns)
        .where(
          and(
            eq(schema.generationRuns.userId, userId),
            inArray(schema.generationRuns.status, ["queued", "running", "awaiting_input"]),
          ),
        )
        .limit(1);
      if (activeRun) return "active_run" as const;

      // A provider call releases the wallet lock while it is in flight but
      // leaves one of these durable protocol markers. Never cascade its audit
      // trail until settlement, abort, or reservation release is visible.
      const [openBillingProtocol] = await tx
        .select({ id: schema.creditLedger.id })
        .from(schema.creditLedger)
        .where(
          and(
            eq(schema.creditLedger.userId, userId),
            sql`(
              (
                (
                  ${schema.creditLedger.externalRef} like 'generation-reservation:%'
                  or ${schema.creditLedger.externalRef} like 'interactive-reservation:%'
                )
                and ${schema.creditLedger.amount} < 0
                and not exists (
                  select 1 from credit_ledger released
                  where released.external_ref =
                    'release:' || ${schema.creditLedger.externalRef}
                )
              )
              or (
                ${schema.creditLedger.externalRef} like 'metering-intent:%'
                and ${schema.creditLedger.amount} = 0
                and not exists (
                  select 1 from credit_ledger terminal
                  where terminal.external_ref in (
                    'intent-settled:' || ${schema.creditLedger.externalRef},
                    'intent-aborted:' || ${schema.creditLedger.externalRef}
                  )
                )
              )
            )`,
          ),
        )
        .limit(1);
      if (openBillingProtocol) return "open_billing" as const;

      const projectIds = projectRows.map((project) => project.id);
      const assetRows =
        projectIds.length === 0
          ? []
          : await tx
              .select({
                projectId: schema.assets.projectId,
                pathname: schema.assets.blobPathname,
              })
              .from(schema.assets)
              .where(inArray(schema.assets.projectId, projectIds));
      const byProject = new Map<string, Set<string>>();
      for (const asset of assetRows) {
        if (!asset.pathname) continue;
        const pathnames = byProject.get(asset.projectId) ?? new Set<string>();
        pathnames.add(asset.pathname);
        byProject.set(asset.projectId, pathnames);
      }
      const cleanupInput = [...byProject.entries()].map(([projectId, pathnames]) => ({
        projectId,
        pathnames: [...pathnames],
      }));

      if (cleanupInput.length > 0) {
        // Schedule before the cascade. A rollback leaves the projects visible,
        // so the delayed workflow safely no-ops; a commit makes the captured
        // pathnames independent of the rows that are about to disappear.
        const [{ start }, { cleanupUserProjectBlobsAfterDelete }] = await Promise.all([
          import("workflow/api"),
          import("@/workflows/cleanup-project-blobs"),
        ]);
        await start(cleanupUserProjectBlobsAfterDelete, [cleanupInput]);
      }

      const [deleted] = await tx
        .delete(schema.users)
        .where(eq(schema.users.id, userId))
        .returning({ id: schema.users.id });
      if (!deleted) throw new Error("User disappeared during account deletion");
      return "deleted" as const;
    });

    if (outcome === "active_run" || outcome === "open_billing") {
      // Svix retries 5xx deliveries. Retrying is safer than erasing an active
      // workflow or an unsettled paid-call protocol.
      return Response.json(
        { error: "Account cleanup is waiting for active authoring work to settle" },
        { status: 503, headers: { "Retry-After": "60" } },
      );
    }
    return Response.json({
      received: true,
      deleted: outcome === "deleted",
    });
  }

  return Response.json({ received: true });
}
