import { auth, currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/db";
import { clerkEnabled } from "@/lib/clerk";

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
 * Clerk webhook is reconciliation, not a critical path. Until the Clerk
 * integration is provisioned, every visitor shares a single dev identity so
 * previews stay fully usable; this path is dead code once keys exist.
 */
export async function requireUser(): Promise<{ userId: string }> {
  if (!clerkEnabled) return devFallbackUser();

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
  }

  return { userId };
}
