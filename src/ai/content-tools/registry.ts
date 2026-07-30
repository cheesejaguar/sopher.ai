import type { MeterCtx } from "@/ai/metering";
import type { QualityTier } from "@/ai/models";

import { imageTool } from "./image";
import { mermaidTool } from "./mermaid";

/**
 * Content tools: small metered AI utilities the editor offers on a selection
 * or block ("Diagram this", "Illustrate this"). Each tool is a pure server
 * function; the /api/content-tools/[toolId] route handles auth, budget, and
 * the content_tool_runs audit row.
 */

export type ContentToolCtx = {
  meter: MeterCtx;
  tier: QualityTier;
  projectId: string;
  chapterId: string;
};

export type ContentToolInput = {
  text: string;
  options?: Record<string, unknown>;
};

export type ContentToolOutput =
  | { kind: "mermaid"; source: string }
  | {
      kind: "image";
      url: string;
      alt: string;
      asset: {
        blobPathname: string;
        contentType: string;
        sizeBytes: number;
        prompt: string;
      };
    };

export type ContentTool = {
  id: string;
  label: string;
  description: string;
  /** lucide icon name, rendered by the client's own icon map. */
  icon: string;
  appliesTo: "selection" | "block";
  /** Rough per-run cost used for the budget pre-flight and the audit row. */
  estUsd: number;
  run(ctx: ContentToolCtx, input: ContentToolInput): Promise<ContentToolOutput>;
};

/** Raised for expected tool failures the route maps to a 422. */
export class ContentToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ContentToolError";
  }
}

const registry = new Map<string, ContentTool>([
  [mermaidTool.id, mermaidTool],
  [imageTool.id, imageTool],
]);

export function getContentTool(id: string): ContentTool | undefined {
  return registry.get(id);
}

export function listContentTools(): ContentTool[] {
  return [...registry.values()];
}
