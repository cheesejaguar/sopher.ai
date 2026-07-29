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

const DEV_USER_ID = "dev-user";

async function devFallbackUser(): Promise<{ userId: string }> {
  const db = getDb();
  await db
    .insert(schema.users)
    .values({ id: DEV_USER_ID, email: "dev@sopher.ai", name: "Studio Guest" })
    .onConflictDoNothing();
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
