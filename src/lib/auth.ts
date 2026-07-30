import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, schema } from "@/db";
import type { Acquisition } from "@/db/schema";
import { clerkEnabled, devAdminAllowed, devAuthAllowed } from "@/lib/clerk";
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from "@/lib/analytics/attribution";
import { grantCredits } from "@/lib/billing/credits";
import { SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits-shared";

export class UnauthorizedError extends Error {
  constructor() {
    super("Not signed in");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super("Not allowed");
    this.name = "ForbiddenError";
  }
}

export class SuspendedError extends Error {
  constructor() {
    super("This account is suspended — contact support@sopher.ai");
    this.name = "SuspendedError";
  }
}

const DEV_USER_ID = "dev-user";

async function devFallbackUser(): Promise<{ userId: string }> {
  const db = getDb();
  const devRole = devAdminAllowed ? "admin" : "user";
  await db
    .insert(schema.users)
    // Admin role: the dev identity exists precisely so local dev and DB-gated
    // e2e can exercise every surface, admin included. The migration promotes
    // pre-existing rows; this covers a fresh database where the row is born
    // after the migration ran. devAdminAllowed is already false on any
    // deployment — set DEV_ADMIN=0 to drop it locally too.
    .values({ id: DEV_USER_ID, email: "dev@sopher.ai", name: "Studio Guest", role: devRole })
    // Update rather than do-nothing: an opt-out has to actually revoke. With
    // do-nothing, a dev-user row created while DEV_ADMIN was unset kept admin
    // forever, so setting DEV_ADMIN=0 looked like it worked and did not.
    .onConflictDoUpdate({
      target: schema.users.id,
      // Avoid request-time clock reads here. With Cache Components enabled,
      // requireUser can run inside a streamed page boundary where new Date()
      // before that boundary's own request read is rejected by Next.js.
      set: { role: devRole },
    });
  // Same welcome grant real users get, so local dev exercises the same
  // credit-gated paths instead of instantly suspending on a zero balance.
  await grantCredits({
    userId: DEV_USER_ID,
    credits: SIGNUP_GRANT_CREDITS,
    description: "Welcome credits",
    externalRef: `signup:${DEV_USER_ID}`,
    kind: "grant",
  });
  return { userId: DEV_USER_ID };
}

/**
 * Reads the first-touch attribution cookie set by the proxy on the landing
 * request. Never throws: attribution is a nice-to-have, and a user who cannot
 * be attributed must still be able to sign up.
 */
async function firstTouch(): Promise<Acquisition | null> {
  try {
    const { cookies } = await import("next/headers");
    const raw = (await cookies()).get(ATTRIBUTION_COOKIE)?.value;
    return parseAttributionCookie(raw);
  } catch {
    return null;
  }
}

/**
 * Resolves the signed-in Clerk user and lazily upserts the users row so the
 * Clerk webhook is reconciliation, not a critical path. Without Clerk keys the
 * shared dev identity is used only when explicitly allowed (development or
 * ALLOW_DEV_AUTH=1); otherwise missing keys fail closed with a loud error.
 */
export async function requireUser(): Promise<{ userId: string }> {
  if (!clerkEnabled) {
    if (devAuthAllowed) {
      console.warn(
        "[auth] Clerk keys absent — serving shared dev fallback identity (dev/ALLOW_DEV_AUTH opt-in)",
      );
      return devFallbackUser();
    }
    // Preserve the fail-closed runtime behavior without trying to evaluate
    // private routes during a public production build that intentionally has
    // no Clerk credentials (for example Lighthouse CI).
    await connection();
    throw new Error("Auth misconfigured: Clerk keys absent in a non-dev environment");
  }

  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();

  const db = getDb();
  const [existing] = await db
    .select({ id: schema.users.id, acquisition: schema.users.acquisition })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  // The Clerk user.created webhook usually wins the race and inserts the row
  // before the first authenticated request reaches us, so the insert branch
  // below never runs and attribution would be lost for essentially everyone.
  // Backfilling here is still first-touch: the cookie is written once, on the
  // landing request, and never refreshed.
  if (existing && !existing.acquisition) {
    const acquisition = await firstTouch();
    if (acquisition) {
      await db.update(schema.users).set({ acquisition }).where(eq(schema.users.id, userId));
    }
  }

  if (!existing) {
    const user = await currentUser();
    await db
      .insert(schema.users)
      .values({
        id: userId,
        email: user?.primaryEmailAddress?.emailAddress ?? "",
        name: user?.fullName ?? null,
        imageUrl: user?.imageUrl ?? null,
        // First touch, stamped exactly once. This branch runs only the first
        // time we see a user, which is both the correct moment for first-touch
        // attribution and the reason it costs nothing on every later request.
        acquisition: await firstTouch(),
      })
      .onConflictDoNothing();

    // Welcome grant — enough to watch a real book begin. Keyed on the user id
    // behind the ledger's unique external_ref index, so the webhook path and
    // this lazy path cannot double-grant however they race.
    await grantCredits({
      userId,
      credits: SIGNUP_GRANT_CREDITS,
      description: "Welcome credits",
      externalRef: `signup:${userId}`,
      kind: "grant",
    });
  }

  return { userId };
}

/**
 * Admin gate. Role lives on the users row (bootstrapped by migration for the
 * founder account and the dev identity); everything admin-shaped calls this
 * and treats failure as 404, so the surface stays quiet.
 */
export async function requireAdmin(): Promise<{ userId: string }> {
  const { userId } = await requireUser();
  const db = getDb();
  const [row] = await db
    .select({ role: schema.users.role })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (row?.role !== "admin") throw new ForbiddenError();
  return { userId };
}

/**
 * Suspension blocks the spend paths — generation, edits, image work, checkout
 * — but never reading or exporting: a suspended author keeps their work.
 */
export async function assertNotSuspended(userId: string): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ suspended: schema.users.suspended })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (row?.suspended) throw new SuspendedError();
}
