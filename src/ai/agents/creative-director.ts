import { generateText, Output } from "ai";

import { anthropicCachedSystem } from "@/ai/cache";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS, type QualityTier } from "@/ai/models";
import {
  buildCreativeQuestionPrompt,
  CREATIVE_DIRECTOR_SYSTEM_PROMPT,
} from "@/ai/prompts/creative-director";
import { creativeQuestionSchema, type BookConcept, type CreativeQuestion } from "@/ai/schemas";

export async function generateCreativeQuestion(input: {
  meter: MeterCtx;
  tier: QualityTier;
  concept: BookConcept;
  brief: string;
  genre?: string;
}): Promise<CreativeQuestion> {
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
        output: Output.object({ schema: creativeQuestionSchema }),
        providerOptions: gatewayOptions(input.meter, "creative-director"),
      }),
  );
  return creativeQuestionSchema.parse(result.output);
}
