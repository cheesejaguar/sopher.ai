import { desc } from "drizzle-orm";

import { schema } from "@/db";

/**
 * One shared definition of "newest completed run". completedAt is the
 * semantic boundary; createdAt and id make ties deterministic across callers.
 */
export function newestCompletedRunOrder() {
  return [
    desc(schema.generationRuns.completedAt),
    desc(schema.generationRuns.createdAt),
    desc(schema.generationRuns.id),
  ] as const;
}

type CompletedRunMoment = {
  id: string;
  completedAt: Date | null;
  createdAt: Date;
};

/** Mirrors the SQL ordering when comparing the newest run of two kinds. */
export function completedRunIsLater(
  candidate: CompletedRunMoment,
  source: CompletedRunMoment,
): boolean {
  const candidateCompleted = candidate.completedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const sourceCompleted = source.completedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (candidateCompleted !== sourceCompleted) return candidateCompleted > sourceCompleted;
  const candidateCreated = candidate.createdAt.getTime();
  const sourceCreated = source.createdAt.getTime();
  if (candidateCreated !== sourceCreated) return candidateCreated > sourceCreated;
  return candidate.id.localeCompare(source.id) > 0;
}
