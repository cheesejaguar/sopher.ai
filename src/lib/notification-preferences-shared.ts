export const NOTIFICATION_PREFERENCES_VERSION = 1 as const;

export const AUTHORING_NOTIFICATION_CATEGORIES = [
  "authoringActionRequired",
  "authoringReminders",
  "authoringCompleted",
] as const;

export type AuthoringNotificationCategory = (typeof AUTHORING_NOTIFICATION_CATEGORIES)[number];

export type NotificationPreferences = {
  version: typeof NOTIFICATION_PREFERENCES_VERSION;
  authoringActionRequired: boolean;
  authoringReminders: boolean;
  authoringCompleted: boolean;
};

/**
 * Preserve the established authoring experience for existing accounts. Authors
 * can then opt out of any optional notice from account settings.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = Object.freeze({
  version: NOTIFICATION_PREFERENCES_VERSION,
  authoringActionRequired: true,
  authoringReminders: true,
  authoringCompleted: true,
});
