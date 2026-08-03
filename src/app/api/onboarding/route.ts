import { z } from "zod";

import { requireUser } from "@/lib/auth";
import {
  AUTHORING_COACHMARKS,
  getAuthoringOnboardingPreferences,
  getAuthoringOnboardingSnapshot,
  updateAuthoringOnboarding,
} from "@/lib/authoring-onboarding";

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("dismiss_checklist"),
    dismissed: z.boolean(),
  }),
  z.object({
    action: z.literal("mark_coachmark_seen"),
    coachmark: z.enum(AUTHORING_COACHMARKS),
  }),
]);

export async function GET(request: Request) {
  const { userId } = await requireUser();
  if (new URL(request.url).searchParams.get("preferences") === "1") {
    return Response.json(await getAuthoringOnboardingPreferences(userId));
  }
  return Response.json(await getAuthoringOnboardingSnapshot(userId));
}

export async function POST(request: Request) {
  const { userId } = await requireUser();
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid onboarding update" }, { status: 400 });
  }
  return Response.json(await updateAuthoringOnboarding(userId, parsed.data));
}
