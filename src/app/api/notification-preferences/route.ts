import { z } from "zod";

import { requireUser } from "@/lib/auth";
import {
  getNotificationSettings,
  updateNotificationPreferences,
} from "@/lib/notification-preferences";

const updateSchema = z
  .object({
    authoringActionRequired: z.boolean().optional(),
    authoringReminders: z.boolean().optional(),
    authoringCompleted: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "At least one preference is required");

const privateJson = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    ...init,
    headers: { "Cache-Control": "private, no-store", ...init?.headers },
  });

export async function GET() {
  const { userId } = await requireUser();
  return privateJson(await getNotificationSettings(userId));
}

export async function PATCH(request: Request) {
  const { userId } = await requireUser();
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return privateJson({ error: "Invalid notification preference update" }, { status: 400 });
  }
  return privateJson({
    preferences: await updateNotificationPreferences(userId, parsed.data),
  });
}
