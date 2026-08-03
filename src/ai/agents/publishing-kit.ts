import { generateText, Output } from "ai";
import { z } from "zod";

import { anthropicCachedSystem } from "@/ai/cache";
import { gatewayOptions, metered, type MeterCtx, type MeteredCallInfo } from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS, type QualityTier } from "@/ai/models";
import {
  buildMatterDraftUserPrompt,
  buildPublishingKitUserPrompt,
  MATTER_DRAFT_SYSTEM_PROMPT,
  PUBLISHING_KIT_SYSTEM_PROMPT,
  type PublishingBookFacts,
} from "@/ai/prompts/publishing-kit";
import { publishingKitSchema, type BookMatterDraftField } from "@/lib/book-package";

export const PUBLISHING_KIT_OPERATION = "publishing.kit";
export const MATTER_DRAFT_OPERATION = "publishing.matter";

/**
 * Both calls are short by construction, so they claim far less of the
 * operation's default output envelope than a chapter-sized one would. The route
 * authorizes credits against this exact call info, so it must not drift.
 */
export function publishingCallInfo(input: {
  kind: "kit" | "matter";
  tier: QualityTier;
}): MeteredCallInfo {
  return {
    role: "publisher",
    model: MODELS[input.tier].concept,
    ...(input.kind === "kit"
      ? { operation: PUBLISHING_KIT_OPERATION, maxOutputTokens: 3_000 }
      : { operation: MATTER_DRAFT_OPERATION, maxOutputTokens: 1_200 }),
  };
}

/** A drafted page is a suggestion, so it is bounded well below the stored max. */
const matterDraftSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(3_000)
    .describe("The page text exactly as it should appear in the book, and nothing else."),
});

export type PublishingKitInput = {
  meter: MeterCtx;
  tier: QualityTier;
  book: PublishingBookFacts;
  instruction?: string;
};

export type MatterDraftInput = PublishingKitInput & { field: BookMatterDraftField };

/**
 * The publishing copy kit: one structured call over material the author already
 * owns. Priced on the concept tier — this is positioning work, the same job the
 * concept agent does at the other end of the book.
 */
export async function generatePublishingKit(input: PublishingKitInput) {
  const info = publishingCallInfo({ kind: "kit", tier: input.tier });

  const result = await metered(input.meter, info, () =>
    generateText({
      model: info.model,
      instructions: anthropicCachedSystem(PUBLISHING_KIT_SYSTEM_PROMPT),
      prompt: buildPublishingKitUserPrompt({ ...input.book, instruction: input.instruction }),
      maxOutputTokens: meteredMaxOutputTokens(info.operation, info.maxOutputTokens),
      prepareStep: meteredInputGuard(info.operation),
      output: Output.object({ schema: publishingKitSchema }),
      providerOptions: gatewayOptions(input.meter, info.role),
    }),
  );

  return result.output;
}

/**
 * One named front/back-matter page, drafted for the author to accept or edit.
 * The caller returns this text; nothing here writes over what they wrote.
 */
export async function draftBookMatter(input: MatterDraftInput): Promise<string> {
  const info = publishingCallInfo({ kind: "matter", tier: input.tier });

  const result = await metered(input.meter, info, () =>
    generateText({
      model: info.model,
      instructions: anthropicCachedSystem(MATTER_DRAFT_SYSTEM_PROMPT),
      prompt: buildMatterDraftUserPrompt({
        ...input.book,
        field: input.field,
        instruction: input.instruction,
      }),
      maxOutputTokens: meteredMaxOutputTokens(info.operation, info.maxOutputTokens),
      prepareStep: meteredInputGuard(info.operation),
      output: Output.object({ schema: matterDraftSchema }),
      providerOptions: gatewayOptions(input.meter, info.role),
    }),
  );

  return result.output.text.trim();
}
