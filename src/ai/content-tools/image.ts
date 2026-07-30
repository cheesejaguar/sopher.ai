import { put } from "@vercel/blob";
import { generateText } from "ai";

import { gatewayOptions, metered } from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS } from "@/ai/models";
import { ContentToolError, type ContentTool } from "./registry";

/**
 * "Illustrate this": two metered calls — a cheap line-edit-tier call rewrites
 * the passage into a concrete visual prompt, then the image model renders it.
 * The first returned image is stored in Blob (public) and recorded as an
 * `assets` row (kind "illustration").
 */

const ALT_MAX_CHARS = 180;

function visualPromptInstruction(passage: string): string {
  return [
    `Rewrite the following book passage as a single concrete prompt for an image model that will illustrate it.`,
    `One paragraph, no preamble, no quotes. Describe subject, setting, mood, lighting, and composition in plain visual terms.`,
    `Style: atmospheric literary book illustration, painterly, muted palette.`,
    ``,
    `Passage:`,
    passage,
  ].join("\n");
}

export const imageTool: ContentTool = {
  id: "illustration",
  label: "Illustrate this",
  description: "Generate an illustration for the selected passage",
  icon: "image",
  appliesTo: "selection",
  estUsd: 0.08,
  async run(ctx, input) {
    const promptModel = MODELS[ctx.tier].lineEdit;
    const promptMeter = { ...ctx.meter, authorizationUsd: 0.01 };
    const promptResult = await metered(
      promptMeter,
      { role: "content-tool", operation: "tool.image.prompt", model: promptModel },
      () =>
        generateText({
          model: promptModel,
          prompt: visualPromptInstruction(input.text),
          maxOutputTokens: meteredMaxOutputTokens("tool.image.prompt"),
          prepareStep: meteredInputGuard("tool.image.prompt"),
          providerOptions: gatewayOptions(promptMeter, "content-tool"),
        }),
    );
    const visualPrompt = promptResult.text.trim();
    if (!visualPrompt) throw new ContentToolError("Could not derive a visual prompt");

    const imageModel = MODELS[ctx.tier].image;
    const imageMeter = { ...ctx.meter, authorizationUsd: 0.07 };
    const imageResult = await metered(
      imageMeter,
      { role: "content-tool", operation: "tool.image.generate", model: imageModel },
      () =>
        generateText({
          model: imageModel,
          prompt: visualPrompt,
          maxOutputTokens: meteredMaxOutputTokens("tool.image.generate"),
          prepareStep: meteredInputGuard("tool.image.generate"),
          providerOptions: gatewayOptions(imageMeter, "content-tool"),
        }),
    );

    const file = imageResult.files.find((f) => f.mediaType?.startsWith("image/"));
    if (!file) throw new ContentToolError("The image model returned no image");

    const contentType = file.mediaType ?? "image/png";
    const blob = await put(
      `images/${ctx.projectId}/${crypto.randomUUID()}.png`,
      Buffer.from(file.uint8Array),
      { access: "public", contentType },
    );

    const alt =
      visualPrompt.length > ALT_MAX_CHARS
        ? `${visualPrompt.slice(0, ALT_MAX_CHARS - 1)}…`
        : visualPrompt;
    return {
      kind: "image",
      url: blob.url,
      alt,
      asset: {
        blobPathname: blob.pathname,
        contentType,
        sizeBytes: file.uint8Array.byteLength,
        prompt: visualPrompt,
      },
    };
  },
};
