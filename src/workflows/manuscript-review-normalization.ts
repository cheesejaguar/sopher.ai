import type { EditSuggestionNormalizationDiagnostics } from "@/ai/schemas";

/**
 * A genuinely clean review has no provider suggestion entries. If entries were
 * returned but normalization accepted none, treating that as "nothing to flag"
 * would conceal a failed paid delivery.
 */
export function providerReviewProducedOnlyRejectedSuggestions(
  diagnostics: EditSuggestionNormalizationDiagnostics,
  deliverableCount: number,
): boolean {
  return diagnostics.receivedCount > 0 && diagnostics.acceptedCount === 0 && deliverableCount === 0;
}
