import { estimateBookCost } from "@/ai/estimate";
import type { QualityTier } from "@/ai/models";
import { canonicalizeCreditRequirement, creditsForUsd } from "@/lib/billing/credits-shared";

/** Complete-production requirement shared by the wizard, Write, and start APIs. */
export function fullBookRequiredCredits(input: {
  tier: QualityTier;
  targetChapters: number;
  targetWordsPerChapter: number;
}): number {
  return canonicalizeCreditRequirement(
    creditsForUsd(
      estimateBookCost(input.tier, input.targetChapters, input.targetWordsPerChapter).totalUsd,
    ),
  );
}
