import "server-only";

import Stripe from "stripe";

/**
 * Stripe client, provisioned through the Vercel Marketplace integration
 * (resource `sopher-payments`), so keys arrive as managed env vars.
 *
 * Note the resource is provisioned as a sandbox: it runs in test mode until
 * claimed with `vercel integration resource claim sopher-payments`.
 */

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured");
    client = new Stripe(key);
  }
  return client;
}

export const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
