import { z } from "zod";

import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getPack } from "@/lib/billing/credits";
import { getStripe, stripeConfigured } from "@/lib/payments/stripe";

/**
 * Starts a Stripe Checkout session for a credit pack.
 *
 * This route never grants credits. It only creates the session; the webhook is
 * the sole authority on payment, because the browser redirect a user lands on
 * after paying is trivially forgeable and cannot be trusted to move money.
 */

export const maxDuration = 60;

const bodySchema = z.object({
  packId: z.string().min(1).max(40),
  /** In-app path to send the buyer back to (e.g. a paused run). */
  returnTo: z
    .string()
    .max(300)
    .regex(/^\/(?!\/)/, "must be an in-app path")
    .optional(),
});

function originFrom(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  // Vercel sets this per-deployment; fall back to the request origin locally.
  const host = req.headers.get("host");
  const proto = host?.startsWith("localhost") ? "http" : "https";
  return host ? `${proto}://${host}` : "https://sopher.ai";
}

export async function POST(req: Request) {
  if (!stripeConfigured) {
    return Response.json({ error: "Payments are not configured" }, { status: 503 });
  }

  let userId: string;
  try {
    ({ userId } = await requireUser());
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return Response.json({ error: "Not signed in" }, { status: 401 });
    }
    throw error;
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Price comes from our own catalog, never from the request — otherwise a
  // caller could name their own price for a pack.
  const { packId, returnTo } = parsed.data;
  const pack = getPack(packId);
  if (!pack) return Response.json({ error: "Unknown pack" }, { status: 404 });

  const origin = originFrom(req);
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    // Reconciled by the webhook; also lets us show the right pack on return.
    client_reference_id: userId,
    metadata: { userId, packId: pack.id, credits: String(pack.credits) },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: pack.usd * 100,
          product_data: {
            name: `${pack.name} — ${pack.credits} credits`,
            description:
              pack.bonus > 0
                ? `${pack.usd} dollars of credit plus ${Math.round(pack.bonus * 100)}% bonus`
                : `${pack.credits} credits for sopher.ai`,
          },
        },
      },
    ],
    success_url: `${origin}/studio/credits?purchase=complete${returnTo ? `&return=${encodeURIComponent(returnTo)}` : ""}`,
    cancel_url: `${origin}/studio/credits?purchase=cancelled`,
  });

  if (!session.url) {
    return Response.json({ error: "Could not start checkout" }, { status: 502 });
  }
  return Response.json({ url: session.url });
}
