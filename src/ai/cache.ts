import type { SystemModelMessage } from "ai";

/**
 * Marks a system prompt as an Anthropic prompt-cache breakpoint. Keep the
 * content byte-identical across calls in a run — verified live: repeat calls
 * read the full prefix from cache at 10% of input price.
 */
export function anthropicCachedSystem(content: string): SystemModelMessage {
  return {
    role: "system",
    content,
    providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
  };
}
