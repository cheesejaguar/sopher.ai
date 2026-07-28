"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, schema } from "@/db";
import { requireUser } from "@/lib/auth";

const budgetInputSchema = z.object({
  monthlyLimitUsd: z.number().min(5, "At least $5").max(500, "At most $500"),
});

/** Upserts the caller's budgets row. The workflow enforces the cap. */
export async function updateBudget(input: unknown) {
  const { userId } = await requireUser();
  const data = budgetInputSchema.parse(input);

  const db = getDb();
  const monthlyLimitUsd = data.monthlyLimitUsd.toFixed(2);
  await db
    .insert(schema.budgets)
    .values({ userId, monthlyLimitUsd })
    .onConflictDoUpdate({
      target: schema.budgets.userId,
      set: { monthlyLimitUsd, updatedAt: new Date() },
    });

  revalidatePath("/studio/settings");
  return { monthlyLimitUsd: data.monthlyLimitUsd };
}
