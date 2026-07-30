import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { getDb, schema, withDbTransaction } from "@/db";
import { grantCredits, reconcileCreditReservations } from "@/lib/billing/credits";
import { SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits-shared";
import { deleteClerkUserTransaction } from "@/lib/account-deletion-transaction";

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

    const outcome = await withDbTransaction((tx) =>
      deleteClerkUserTransaction(tx, {
        userId,
        // Schedule before the cascade. A rollback leaves the projects visible,
        // so the delayed workflow safely no-ops.
        scheduleCleanup: async (cleanupInput) => {
          const [{ start }, { cleanupUserProjectBlobsAfterDelete }] = await Promise.all([
            import("workflow/api"),
            import("@/workflows/cleanup-project-blobs"),
          ]);
          await start(cleanupUserProjectBlobsAfterDelete, [cleanupInput]);
        },
      }),
    );

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
