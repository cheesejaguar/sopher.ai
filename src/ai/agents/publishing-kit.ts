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
import {
  publishingKitSchema,
  type BookMatterDraftField,
  type PublishingKit,
} from "@/lib/book-package";
import {
  asRecord,
  coerceString,
  coerceStringArray,
  truncateArray,
  truncateString,
} from "@/ai/schemas/normalize";

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
const MAX_MATTER_DRAFT_CHARS = 3_000;

/**
 * Wire schemas: Anthropic strips length bounds before the model sees them, so
 * the strict kit/matter schemas failed a paid call over a blurb a few words
 * long or one keyword too many. Bounds live in the descriptions and the
 * normalizers below; an empty answer still reaches the route, which refunds it.
 */
const matterDraftWireSchema = z.object({
  text: z
    .string()
    .describe(
      `The page text exactly as it should appear in the book, and nothing else. At most ${MAX_MATTER_DRAFT_CHARS} characters.`,
    ),
});

const publishingKitWireSchema = z.object({
  blurb: z
    .string()
    .nullish()
    .describe(publishingKitSchema.shape.blurb.description ?? ""),
  storeDescription: z
    .string()
    .nullish()
    .describe(publishingKitSchema.shape.storeDescription.description ?? ""),
  keywords: z
    .array(z.string().nullish())
    .nullish()
    .describe(publishingKitSchema.shape.keywords.description ?? ""),
  categories: z
    .array(z.string().nullish())
    .nullish()
    .describe(publishingKitSchema.shape.categories.description ?? ""),
  authorBio: z
    .string()
    .nullish()
    .describe(publishingKitSchema.shape.authorBio.description ?? ""),
});

const KIT_LIMITS = {
  blurb: 1_200,
  storeDescription: 4_000,
  authorBio: 1_200,
  keywords: 10,
  keywordChars: 60,
  categories: 5,
  categoryChars: 120,
} as const;

/** Lands any kit answer on publishingKitSchema; an over-long entry is dropped, not cut. */
export function normalizePublishingKit(wire: unknown): PublishingKit {
  const value = asRecord(wire);
  const text = (field: unknown, max: number) => truncateString(coerceString(field).trim(), max);
  const list = (field: unknown, maxItems: number, maxChars: number) =>
    truncateArray(
      coerceStringArray(field).filter((entry) => entry.length <= maxChars),
      maxItems,
    );
  return publishingKitSchema.parse({
    blurb: text(value.blurb, KIT_LIMITS.blurb),
    storeDescription: text(value.storeDescription, KIT_LIMITS.storeDescription),
    keywords: list(value.keywords, KIT_LIMITS.keywords, KIT_LIMITS.keywordChars),
    categories: list(value.categories, KIT_LIMITS.categories, KIT_LIMITS.categoryChars),
    authorBio: text(value.authorBio, KIT_LIMITS.authorBio),
  });
}

export function normalizeMatterDraft(wire: unknown): string {
  return truncateString(coerceString(asRecord(wire).text).trim(), MAX_MATTER_DRAFT_CHARS);
}

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
      output: Output.object({ schema: publishingKitWireSchema }),
      providerOptions: gatewayOptions(input.meter, info.role, { model: info.model }),
    }),
  );

  return normalizePublishingKit(result.output);
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
      output: Output.object({ schema: matterDraftWireSchema }),
      providerOptions: gatewayOptions(input.meter, info.role, { model: info.model }),
    }),
  );

  return normalizeMatterDraft(result.output);
}
