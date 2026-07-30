import { generateText } from "ai";

import { gatewayOptions, metered } from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS } from "@/ai/models";

import { ContentToolError, type ContentTool } from "./registry";

/**
 * "Diagram this": one cheap structured call that turns a passage into Mermaid
 * source. Rendering (and render-error handling) happens client-side in the
 * editor's code-block node view, so the server just returns clean source.
 */

const FENCE_RE = /```(?:mermaid)?\s*\n([\s\S]*?)```/;

export function extractMermaidSource(text: string): string {
  const match = FENCE_RE.exec(text);
  return (match ? match[1] : text).trim();
}

function mermaidPrompt(passage: string): string {
  return [
    `Turn the following passage from a book into a single Mermaid diagram that clarifies its structure (a flowchart, sequence, timeline, or graph — whichever fits the content best).`,
    `Rules:`,
    `- Respond with exactly one fenced \`\`\`mermaid code block and nothing else.`,
    `- Use valid Mermaid syntax (v11). Prefer "flowchart TD" unless another type clearly fits better.`,
    `- Keep node labels short (under 8 words); quote labels containing punctuation.`,
    `- At most ~15 nodes.`,
    ``,
    `Passage:`,
    passage,
  ].join("\n");
}

export const mermaidTool: ContentTool = {
  id: "mermaid",
  label: "Diagram this",
  description: "Turn the selected passage into a Mermaid diagram figure",
  icon: "workflow",
  appliesTo: "selection",
  estUsd: 0.01,
  async run(ctx, input) {
    const model = MODELS[ctx.tier].lineEdit;
    const meter = { ...ctx.meter, authorizationUsd: 0.01 };
    const result = await metered(
      meter,
      { role: "content-tool", operation: "tool.mermaid", model },
      () =>
        generateText({
          model,
          prompt: mermaidPrompt(input.text),
          maxOutputTokens: meteredMaxOutputTokens("tool.mermaid"),
          prepareStep: meteredInputGuard("tool.mermaid"),
          providerOptions: gatewayOptions(meter, "content-tool"),
        }),
    );

    const source = extractMermaidSource(result.text);
    if (!source) throw new ContentToolError("The model returned no diagram source");
    return { kind: "mermaid", source };
  },
};
