"use client";

import { track as vercelTrack } from "@vercel/analytics";

import type { EventName, EventProps } from "./events";

/**
 * One call, three destinations.
 *
 *  - GA4, for acquisition and channel reporting.
 *  - Vercel Analytics, for the custom-event view next to page traffic.
 *  - Our own /api/events, which is what the admin dashboard queries. GA cannot
 *    be joined to a user's lifetime revenue; Postgres can.
 *
 * Fire-and-forget in every direction. Analytics must never block an
 * interaction or surface an error to an author — a lost event is a rounding
 * error, a broken wizard is not.
 */

declare global {
  interface Window {
    gtag?: (command: string, name: string, params?: Record<string, unknown>) => void;
  }
}

export function track(name: EventName, props: EventProps = {}): void {
  if (typeof window === "undefined") return;

  try {
    window.gtag?.("event", name, props);
  } catch {
    // GA blocked by an extension is the common case, and it is fine.
  }

  try {
    vercelTrack(name, props);
  } catch {
    // Same.
  }

  // keepalive so the write survives the navigation that often triggers it —
  // begin_checkout is immediately followed by a redirect to Stripe.
  try {
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, props }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Ignore.
  }
}
