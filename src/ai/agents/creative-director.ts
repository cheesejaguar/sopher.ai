import { generateText, Output } from "ai";

import { anthropicCachedSystem } from "@/ai/cache";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS, type QualityTier } from "@/ai/models";
import {
  buildCreativeQuestionPrompt,
  CREATIVE_DIRECTOR_SYSTEM_PROMPT,
} from "@/ai/prompts/creative-director";
import {
  creativeQuestionWireSchema,
  normalizeCreativeQuestion,
  type BookConcept,
  type CreativeQuestion,
} from "@/ai/schemas";

/**
 * Asks the author one story-direction question before outlining.
 *
 * Returns null when the answer cannot be made into a real choice — fewer than
 * three usable options, or no question worth asking. Null is the
 * already-supported "no question" outcome: the caller skips the optional
 * creative-direction beat and outlines straight from the concept. It must never
 * be retried, because the same request produces the same answer; the author
 * would pay twice for the same skip.
 */
export async function generateCreativeQuestion(input: {
  meter: MeterCtx;
  tier: QualityTier;
  concept: BookConcept;
  brief: string;
  genre?: string;
}): Promise<CreativeQuestion | null> {
  const model = MODELS[input.tier].outline;
  const result = await metered(
    input.meter,
    { role: "creative-director", operation: "creative.question", model },
    () =>
      generateText({
        model,
        instructions: anthropicCachedSystem(CREATIVE_DIRECTOR_SYSTEM_PROMPT),
        prompt: buildCreativeQuestionPrompt(input),
        maxOutputTokens: meteredMaxOutputTokens("creative.question"),
        prepareStep: meteredInputGuard("creative.question"),
        // The strict schema used to sit here, and it was one of the two calls
        // that actually failed in production: Anthropic's structured-output
        // path drops the `option-1|option-2|option-3` enum and every length
        // bound, so ids of "1", a fourth option, or an eighty-first character
        // in a label all came back as violations the model was never shown.
        // The wire schema carries none of those, and the normalizer reassigns
        // ids positionally and truncates on the way to CreativeQuestion.
        output: Output.object({ schema: creativeQuestionWireSchema }),
        providerOptions: gatewayOptions(input.meter, "creative-director"),
      }),
  );
  return normalizeCreativeQuestion(result.output);
}
