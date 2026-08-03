import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb, schema } from "@/db";
import type { Acquisition } from "@/db/schema";
import { clerkEnabled, devAdminAllowed, devAuthAllowed } from "@/lib/clerk";
import { ATTRIBUTION_COOKIE, parseAttributionCookie } from "@/lib/analytics/attribution";
import { grantCredits } from "@/lib/billing/credits";
import { SIGNUP_GRANT_CREDITS } from "@/lib/billing/credits-shared";
import { isE2ETrialUserId, isE2EWorkflowStubEnabled } from "@/lib/e2e-workflow-stub";

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
const E2E_USER_HEADER = "x-sopher-e2e-user";
let devFallbackProvisioning: Promise<{ userId: string }> | null = null;
let devFallbackWarningShown = false;

async function isolatedE2EUser(): Promise<{ userId: string } | null> {
  if (!isE2EWorkflowStubEnabled()) return null;
  const { headers } = await import("next/headers");
  const userId = (await headers()).get(E2E_USER_HEADER);
  if (!isE2ETrialUserId(userId)) return null;

  const db = getDb();
  await db
    .insert(schema.users)
    .values({
      id: userId,
      email: `${userId}@example.invalid`,
      name: "Included Story Tester",
      role: "user",
    })
    .onConflictDoNothing();
  await grantCredits({
    userId,
    credits: SIGNUP_GRANT_CREDITS,
    description: "Included story test allowance",
    externalRef: `signup:${userId}`,
    kind: "grant",
  });
  return { userId };
}

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
  // Same internal included-story allowance real users get, so local dev
  // exercises the credit-gated paths instead of starting at zero.
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
 * Private pages can resolve auth many times during one streamed render. The
 * shared development identity only needs provisioning once per server
 * process; repeating the upsert and ledger grant for every nested layout can
 * overwhelm a small local/preview database and make alternate browser engines
 * appear to hang. Isolated E2E identities intentionally bypass this cache.
 */
function provisionDevFallbackOnce(): Promise<{ userId: string }> {
  if (!devFallbackProvisioning) {
    if (!devFallbackWarningShown) {
      console.warn(
        "[auth] Clerk keys absent — serving shared dev fallback identity (dev/ALLOW_DEV_AUTH opt-in)",
      );
      devFallbackWarningShown = true;
    }
    devFallbackProvisioning = devFallbackUser().catch((error: unknown) => {
      // A transient database failure must remain retryable on the next request.
      devFallbackProvisioning = null;
      throw error;
    });
  }
  return devFallbackProvisioning;
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
      const isolatedIdentity = await isolatedE2EUser();
      if (isolatedIdentity) return isolatedIdentity;
      return provisionDevFallbackOnce();
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
  }

  // Self-healing internal allowance. This is intentionally outside the user
  // insert branch: an out-of-order webhook or partial prior request can leave
  // the user row present while its grant is absent. The unique external ref
  // makes this safe and idempotent on every authenticated provisioning pass.
  await grantCredits({
    userId,
    credits: SIGNUP_GRANT_CREDITS,
    description: "Welcome credits",
    externalRef: `signup:${userId}`,
    kind: "grant",
  });

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
