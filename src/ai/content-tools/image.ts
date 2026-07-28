import { put } from "@vercel/blob";
import { generateText } from "ai";

import { gatewayOptions, metered } from "@/ai/metering";
import { MODELS } from "@/ai/models";
import { getDb, schema } from "@/db";

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
  estUsd: 0.05,
  async run(ctx, input) {
    const promptModel = MODELS[ctx.tier].lineEdit;
    const promptResult = await metered(
      ctx.meter,
      { role: "content-tool", operation: "tool.image.prompt", model: promptModel },
      () =>
        generateText({
          model: promptModel,
          prompt: visualPromptInstruction(input.text),
          providerOptions: gatewayOptions(ctx.meter, "content-tool"),
        }),
    );
    const visualPrompt = promptResult.text.trim();
    if (!visualPrompt) throw new ContentToolError("Could not derive a visual prompt");

    const imageModel = MODELS[ctx.tier].image;
    const imageResult = await metered(
      ctx.meter,
      { role: "content-tool", operation: "tool.image.generate", model: imageModel },
      () =>
        generateText({
          model: imageModel,
          prompt: visualPrompt,
          providerOptions: gatewayOptions(ctx.meter, "content-tool"),
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

    const db = getDb();
    await db.insert(schema.assets).values({
      projectId: ctx.projectId,
      chapterId: ctx.chapterId,
      kind: "illustration",
      blobUrl: blob.url,
      blobPathname: blob.pathname,
      contentType,
      sizeBytes: file.uint8Array.byteLength,
      meta: { prompt: visualPrompt },
    });

    const alt =
      visualPrompt.length > ALT_MAX_CHARS
        ? `${visualPrompt.slice(0, ALT_MAX_CHARS - 1)}…`
        : visualPrompt;
    return { kind: "image", url: blob.url, alt };
  },
};
