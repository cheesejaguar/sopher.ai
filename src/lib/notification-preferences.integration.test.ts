import { randomUUID } from "node:crypto";

import { neon } from "@neondatabase/serverless";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  claimAuthoringNotificationDelivery,
  getNotificationPreferences,
  settleAuthoringNotificationDelivery,
  updateNotificationPreferences,
} from "@/lib/notification-preferences";

function isolatedDatabaseUrl(): string | null {
  const isolated = process.env.E2E_DATABASE_ISOLATED;
  const value = process.env.E2E_DATABASE_URL?.trim();
  if (isolated !== "1" && !value) return null;
  if (isolated !== "1" || !value || process.env.NODE_ENV === "production") {
    throw new Error("Notification preference tests require a disposable isolated database.");
  }
  const parsed = new URL(value);
  const allowedHost = process.env.E2E_DATABASE_HOST?.trim();
  if (!allowedHost || parsed.hostname !== allowedHost) {
    throw new Error("E2E_DATABASE_HOST must match the disposable notification test database.");
  }
  return value;
}

const databaseUrl = isolatedDatabaseUrl();
const describeIsolated = databaseUrl ? describe : describe.skip;

describeIsolated("notification preferences against isolated Neon", () => {
  const userId = `e2e-notifications-${randomUUID()}`;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let observer: ReturnType<typeof neon>;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Disposable database URL disappeared.");
    process.env.DATABASE_URL = databaseUrl;
    observer = neon(databaseUrl);
    await observer`
      insert into users (id, email)
      values (${userId}, ${`${userId}@example.test`})
    `;
  });

  afterAll(async () => {
    if (observer) await observer`delete from users where id = ${userId}`;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("defaults every existing authoring category on and preserves concurrent field updates", async () => {
    await expect(getNotificationPreferences(userId)).resolves.toEqual({
      version: 1,
      authoringActionRequired: true,
      authoringReminders: true,
      authoringCompleted: true,
    });

    await Promise.all([
      updateNotificationPreferences(userId, { authoringActionRequired: false }),
      updateNotificationPreferences(userId, { authoringCompleted: false }),
    ]);

    await expect(getNotificationPreferences(userId)).resolves.toEqual({
      version: 1,
      authoringActionRequired: false,
      authoringReminders: true,
      authoringCompleted: false,
    });
  });

  it("makes suppression durable across later opt-in and makes sent events replay-safe", async () => {
    const suppressedKey = `run:${randomUUID()}:needs-attention`;
    await updateNotificationPreferences(userId, { authoringActionRequired: false });
    await expect(
      claimAuthoringNotificationDelivery({
        userId,
        category: "authoringActionRequired",
        eventKey: suppressedKey,
      }),
    ).resolves.toBeNull();

    await updateNotificationPreferences(userId, { authoringActionRequired: true });
    await expect(
      claimAuthoringNotificationDelivery({
        userId,
        category: "authoringActionRequired",
        eventKey: suppressedKey,
      }),
    ).resolves.toBeNull();

    const sentKey = `run:${randomUUID()}:book-finished`;
    await updateNotificationPreferences(userId, { authoringCompleted: true });
    const sentClaim = await claimAuthoringNotificationDelivery({
      userId,
      category: "authoringCompleted",
      eventKey: sentKey,
    });
    expect(sentClaim).toEqual(expect.any(String));
    if (!sentClaim) throw new Error("Expected a delivery claim");
    await settleAuthoringNotificationDelivery({
      eventKey: sentKey,
      claimToken: sentClaim,
      delivered: true,
    });
    await expect(
      claimAuthoringNotificationDelivery({
        userId,
        category: "authoringCompleted",
        eventKey: sentKey,
      }),
    ).resolves.toBeNull();

    const rows = (await observer`
      select event_key, status, attempts
      from notification_deliveries
      where user_id = ${userId}
      order by event_key
    `) as unknown as Array<{ event_key: string; status: string; attempts: number }>;
    expect(rows).toEqual(
      expect.arrayContaining([
        { event_key: suppressedKey, status: "suppressed", attempts: 0 },
        { event_key: sentKey, status: "sent", attempts: 1 },
      ]),
    );
  });

  it("grants one concurrent lease and never lets a stale failure downgrade sent mail", async () => {
    const eventKey = `run:${randomUUID()}:outline-ready:1`;
    await updateNotificationPreferences(userId, { authoringActionRequired: true });

    const claims = await Promise.all(
      Array.from({ length: 8 }, () =>
        claimAuthoringNotificationDelivery({
          userId,
          category: "authoringActionRequired",
          eventKey,
        }),
      ),
    );
    const winners = claims.filter((claim): claim is string => claim !== null);
    expect(winners).toHaveLength(1);

    await settleAuthoringNotificationDelivery({
      eventKey,
      claimToken: winners[0],
      delivered: true,
    });
    await settleAuthoringNotificationDelivery({
      eventKey,
      claimToken: randomUUID(),
      delivered: false,
    });

    const rows = (await observer`
      select status, attempts, claim_token, lease_expires_at
      from notification_deliveries
      where event_key = ${eventKey}
    `) as unknown as Array<{
      status: string;
      attempts: number;
      claim_token: string | null;
      lease_expires_at: Date | null;
    }>;
    expect(rows).toEqual([
      {
        status: "sent",
        attempts: 1,
        claim_token: null,
        lease_expires_at: null,
      },
    ]);
  });
});
