import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { clerkEnabled, devAuthAllowed } from "@/lib/clerk";
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
  await db
    .insert(schema.users)
    // Admin role: the dev identity exists precisely so local dev and DB-gated
    // e2e can exercise every surface, admin included. The migration promotes
    // pre-existing rows; this covers a fresh database where the row is born
    // after the migration ran.
    .values({ id: DEV_USER_ID, email: "dev@sopher.ai", name: "Studio Guest", role: "admin" })
    .onConflictDoNothing();
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
    throw new Error("Auth misconfigured: Clerk keys absent in a non-dev environment");
  }

  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();

  const db = getDb();
  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (existing.length === 0) {
    const user = await currentUser();
    await db
      .insert(schema.users)
      .values({
        id: userId,
        email: user?.primaryEmailAddress?.emailAddress ?? "",
        name: user?.fullName ?? null,
        imageUrl: user?.imageUrl ?? null,
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
