import type { ProjectExperience } from "@/db/schema";
import type { GenerationConfig } from "@/lib/run-events";

export { type ProjectExperience };

/**
 * The included experience is a complete, deliberately small production—not a
 * client-selected cheap preset. Every spend path and retry derives from this
 * server-owned shape.
 */
export const TRIAL_STORY_CONFIG = {
  productionMode: "trial_short_story",
  tier: "standard",
  requireOutlineApproval: true,
  waveSize: 1,
  targetChapters: 3,
  targetWordsPerChapter: 1_000,
} as const satisfies Pick<
  GenerationConfig,
  | "productionMode"
  | "tier"
  | "requireOutlineApproval"
  | "waveSize"
  | "targetChapters"
  | "targetWordsPerChapter"
>;
