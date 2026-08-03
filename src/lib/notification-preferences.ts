import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, isNull, lte, or, sql } from "drizzle-orm";

import { getDb, schema } from "@/db";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCES_VERSION,
  type AuthoringNotificationCategory,
  type NotificationPreferences,
} from "@/lib/notification-preferences-shared";

type NotificationPreferenceRow = {
  authoringActionRequired: boolean;
  authoringReminders: boolean;
  authoringCompleted: boolean;
};

const preferenceSelection = {
  authoringActionRequired: schema.users.emailAuthoringActionRequired,
  authoringReminders: schema.users.emailAuthoringReminders,
  authoringCompleted: schema.users.emailAuthoringCompleted,
};

export type NotificationPreferencesUpdate = Partial<
  Pick<
    NotificationPreferences,
    "authoringActionRequired" | "authoringReminders" | "authoringCompleted"
  >
>;

export function notificationPreferencesFromRow(
  row?: Partial<NotificationPreferenceRow> | null,
): NotificationPreferences {
  return {
    version: NOTIFICATION_PREFERENCES_VERSION,
    authoringActionRequired:
      row?.authoringActionRequired ?? DEFAULT_NOTIFICATION_PREFERENCES.authoringActionRequired,
    authoringReminders:
      row?.authoringReminders ?? DEFAULT_NOTIFICATION_PREFERENCES.authoringReminders,
    authoringCompleted:
      row?.authoringCompleted ?? DEFAULT_NOTIFICATION_PREFERENCES.authoringCompleted,
  };
}

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const [row] = await getDb()
    .select(preferenceSelection)
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return notificationPreferencesFromRow(row);
}

export async function getNotificationSettings(userId: string): Promise<{
  email: string;
  preferences: NotificationPreferences;
}> {
  const [row] = await getDb()
    .select({ email: schema.users.email, ...preferenceSelection })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!row) throw new Error("User not found");
  return { email: row.email, preferences: notificationPreferencesFromRow(row) };
}

/** Each PATCH changes only the supplied columns, so concurrent toggles cannot overwrite siblings. */
export async function updateNotificationPreferences(
  userId: string,
  update: NotificationPreferencesUpdate,
): Promise<NotificationPreferences> {
  const values = {
    ...(update.authoringActionRequired === undefined
      ? {}
      : { emailAuthoringActionRequired: update.authoringActionRequired }),
    ...(update.authoringReminders === undefined
      ? {}
      : { emailAuthoringReminders: update.authoringReminders }),
    ...(update.authoringCompleted === undefined
      ? {}
      : { emailAuthoringCompleted: update.authoringCompleted }),
    updatedAt: new Date(),
  };
  const [row] = await getDb()
    .update(schema.users)
    .set(values)
    .where(eq(schema.users.id, userId))
    .returning(preferenceSelection);
  if (!row) throw new Error("User not found");
  return notificationPreferencesFromRow(row);
}

/**
 * Optional email fails closed when its owner or latest preference cannot be
 * resolved. Authoring itself must continue, and billing/security mail does not
 * call this boundary.
 */
export async function maySendAuthoringNotification(
  userId: string,
  category: AuthoringNotificationCategory,
): Promise<boolean> {
  try {
    const [row] = await getDb()
      .select({ enabled: preferenceSelection[category] })
      .from(schema.users)
      .where(eq(schema.users.id, userId))
      .limit(1);
    return row?.enabled === true;
  } catch (error) {
    console.warn("[email] notification preference could not be resolved", {
      category,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return false;
  }
}

/**
 * Claims one content-free delivery event. The first preference decision is
 * durable: a suppressed event stays suppressed even if a later replay happens
 * after the author has opted back in.
 */
export async function claimAuthoringNotificationDelivery(input: {
  userId: string;
  category: AuthoringNotificationCategory;
  eventKey: string;
}): Promise<string | null> {
  const enabled = await maySendAuthoringNotification(input.userId, input.category);
  const now = new Date();
  const claimToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  const [inserted] = await getDb()
    .insert(schema.notificationDeliveries)
    .values({
      userId: input.userId,
      category: input.category,
      eventKey: input.eventKey,
      status: enabled ? "pending" : "suppressed",
      attempts: enabled ? 1 : 0,
      ...(enabled ? { claimToken, leaseExpiresAt } : {}),
      updatedAt: now,
    })
    .onConflictDoNothing({ target: schema.notificationDeliveries.eventKey })
    .returning({
      status: schema.notificationDeliveries.status,
      claimToken: schema.notificationDeliveries.claimToken,
    });
  if (inserted) return inserted.status === "pending" ? inserted.claimToken : null;

  const [existing] = await getDb()
    .select({
      userId: schema.notificationDeliveries.userId,
      category: schema.notificationDeliveries.category,
      status: schema.notificationDeliveries.status,
      leaseExpiresAt: schema.notificationDeliveries.leaseExpiresAt,
    })
    .from(schema.notificationDeliveries)
    .where(eq(schema.notificationDeliveries.eventKey, input.eventKey))
    .limit(1);
  if (
    !existing ||
    existing.userId !== input.userId ||
    existing.category !== input.category ||
    existing.status === "sent" ||
    existing.status === "suppressed"
  ) {
    return null;
  }

  if (existing.status === "failed" && !enabled) {
    await getDb()
      .update(schema.notificationDeliveries)
      .set({
        status: "suppressed",
        claimToken: null,
        leaseExpiresAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(schema.notificationDeliveries.eventKey, input.eventKey),
          eq(schema.notificationDeliveries.status, "failed"),
        ),
      );
    return null;
  }

  const [reclaimed] = await getDb()
    .update(schema.notificationDeliveries)
    .set({
      status: "pending",
      attempts: sql`${schema.notificationDeliveries.attempts} + 1`,
      claimToken,
      leaseExpiresAt,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.notificationDeliveries.eventKey, input.eventKey),
        eq(schema.notificationDeliveries.userId, input.userId),
        eq(schema.notificationDeliveries.category, input.category),
        or(
          eq(schema.notificationDeliveries.status, "failed"),
          and(
            eq(schema.notificationDeliveries.status, "pending"),
            or(
              isNull(schema.notificationDeliveries.leaseExpiresAt),
              lte(schema.notificationDeliveries.leaseExpiresAt, now),
            ),
          ),
        ),
      ),
    )
    .returning({ claimToken: schema.notificationDeliveries.claimToken });
  return reclaimed?.claimToken ?? null;
}

export async function settleAuthoringNotificationDelivery(input: {
  eventKey: string;
  claimToken: string;
  delivered: boolean;
}): Promise<void> {
  const now = new Date();
  await getDb()
    .update(schema.notificationDeliveries)
    .set({
      status: input.delivered ? "sent" : "failed",
      ...(input.delivered ? { sentAt: now } : {}),
      claimToken: null,
      leaseExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(schema.notificationDeliveries.eventKey, input.eventKey),
        eq(schema.notificationDeliveries.claimToken, input.claimToken),
        eq(schema.notificationDeliveries.status, "pending"),
      ),
    );
}
