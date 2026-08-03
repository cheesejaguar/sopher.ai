import type Stripe from "stripe";

import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { grantCredits } from "@/lib/billing/credits";
import { sendReceiptEmail } from "@/lib/email/send";
import { getStripe, stripeConfigured } from "@/lib/payments/stripe";

/**
 * The sole authority on payment.
 *
 * Credits are granted here and nowhere else. The success_url a customer lands
 * on after paying is attacker-controllable, so it only ever refreshes the UI —
 * money moves when Stripe tells us it moved, over a signed request.
 *
 * Stripe retries deliveries, so every grant is keyed on the Checkout Session id
 * behind a unique index. A replay hits the constraint and grants nothing.
 */

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!stripeConfigured) {
    return Response.json({ error: "Payments are not configured" }, { status: 503 });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing signature" }, { status: 400 });
  }

  // Must be the raw body — any parse/re-serialize breaks the signature.
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(payload, signature, secret);
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    // Only fulfil once payment actually cleared — a session can complete with
    // an async method still pending.
    if (session.payment_status !== "paid") {
      return Response.json({ received: true, ignored: "payment not settled" });
    }

    const userId = session.metadata?.userId ?? session.client_reference_id ?? null;
    const credits = Number(session.metadata?.credits ?? 0);
    const packId = session.metadata?.packId ?? "credits";

    if (!userId || !Number.isFinite(credits) || credits <= 0) {
      // Nothing actionable, but return 200: a 4xx makes Stripe retry forever.
      return Response.json({ received: true, ignored: "missing metadata" });
    }

    const granted = await grantCredits({
      userId,
      credits,
      description: `${packId} pack — ${credits} credits`,
      externalRef: session.id,
      // What Stripe actually collected. Credits are not dollars once bonus
      // tiers exist ($60 buys 66 credits), so this is the only figure that
      // reconciles with the Stripe dashboard.
      usdPaid: (session.amount_total ?? 0) / 100,
    });

    // Receipt only on first fulfilment — a retried delivery must not re-mail.
    // And never let the receipt path fail the response: a 500 here would make
    // Stripe redeliver into the idempotent no-op, losing the receipt forever.
    if (granted) {
      try {
        const [user] = await getDb()
          .select({ email: schema.users.email })
          .from(schema.users)
          .where(eq(schema.users.id, userId))
          .limit(1);
        if (user?.email) {
          await sendReceiptEmail({
            to: user.email,
            packName: packId,
            credits,
            usd: (session.amount_total ?? 0) / 100,
            idempotencyKey: `stripe-receipt:${session.id}`,
          });
        }
      } catch (error) {
        console.warn("[email] receipt failed after grant:", error);
      }
    }

    return Response.json({ received: true, granted });
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    const userId = charge.metadata?.userId;
    // `amount_refunded` is CUMULATIVE across partial refunds, so each event is
    // recorded per refund object — its own id, its own amount — and the unique
    // external_ref index makes redelivery of the same refund a no-op.
    // Always fetch the refund list from the API: webhook payloads either omit
    // it entirely on current API versions or include a possibly-truncated
    // inline copy — an empty-but-present array must not skip the clawback.
    const refunds = (await getStripe().refunds.list({ charge: charge.id, limit: 100 })).data;
    if (userId) {
      for (const refund of refunds) {
        const usd = (refund.amount ?? 0) / 100;
        if (usd <= 0) continue;
        await grantCredits({
          userId,
          // Refunds claw back at face value, not at the bonus-inclusive rate.
          credits: -usd,
          description: `Refund — $${usd.toFixed(2)}`,
          externalRef: `refund:${refund.id}`,
          kind: "refund",
          // Negative so net revenue is a plain sum over usd_paid.
          usdPaid: -usd,
        });
      }
    }
    return Response.json({ received: true });
  }

  return Response.json({ received: true });
}
