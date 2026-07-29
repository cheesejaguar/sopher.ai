import { Webhook } from "svix";
import { getDb, schema } from "@/db";
import { grantCredits } from "@/lib/billing/credits";
import { SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits-shared";

type ClerkUserEvent = {
  type: string;
  data: {
    id: string;
    email_addresses?: { id: string; email_address: string }[];
    primary_email_address_id?: string;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
  };
};

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) {
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ClerkUserEvent;
  try {
    event = new Webhook(secret).verify(payload, headers) as ClerkUserEvent;
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

  return Response.json({ received: true });
}
