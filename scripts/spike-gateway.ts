/**
 * Phase 5 spike: verifies the three risky integrations against live services.
 * 1. AI Gateway auth via OIDC + basic generateText on current models
 * 2. Anthropic prompt caching through the gateway (cacheReadTokens > 0 on 2nd call)
 * 3. v7 tool loop (inputSchema/isStepCount) + Output.object structured output
 * Run: pnpm exec dotenv -e .env.local -- pnpm exec tsx scripts/spike-gateway.ts
 */
import { generateText, Output, isStepCount, tool } from "ai";
import { z } from "zod";

const SONNET = "anthropic/claude-sonnet-5";

// ~2,600 tokens of stable prefix — comfortably above Anthropic's minimum cacheable size.
const bigSystemPrefix =
  "You are the chapter writer for a book-writing studio. Follow these style principles.\n" +
  "Principle: show, don't tell. ".repeat(400) +
  "\nAlways answer briefly.";

function usageLine(label: string, usage: Record<string, unknown>) {
  console.log(label, JSON.stringify(usage));
}

async function spikeCaching() {
  console.log("\n=== Spike 1: prompt caching through gateway ===");
  const call = () =>
    generateText({
      model: SONNET,
      instructions: {
        role: "system",
        content: bigSystemPrefix,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      prompt: "Say 'ready' and nothing else.",
      providerOptions: { gateway: { caching: "auto", tags: ["spike"] } },
      maxOutputTokens: 16,
    });

  const first = await call();
  usageLine("call1 usage:", first.usage as unknown as Record<string, unknown>);
  const second = await call();
  usageLine("call2 usage:", second.usage as unknown as Record<string, unknown>);

  const cacheRead = second.usage.inputTokenDetails?.cacheReadTokens ?? 0;
  const cacheWrite = first.usage.inputTokenDetails?.cacheWriteTokens ?? 0;
  console.log(`cacheWrite(call1)=${cacheWrite} cacheRead(call2)=${cacheRead}`);
  if (cacheRead > 0) {
    console.log("PASS: prompt caching works through the gateway");
  } else {
    console.log("FAIL: no cached reads observed — investigate before relying on cache savings");
  }
}

async function spikeToolLoopAndOutput() {
  console.log("\n=== Spike 2: tool loop + structured output ===");
  const result = await generateText({
    model: SONNET,
    instructions:
      "You check the character bible before answering. Use the characterBible tool, then answer.",
    prompt: "What color are Mira's eyes? Reply with JSON.",
    tools: {
      characterBible: tool({
        description: "Look up canonical facts about a character",
        inputSchema: z.object({ name: z.string() }),
        execute: async ({ name }) => ({
          name,
          facts: { eyes: "storm-gray", hair: "black", firstAppearance: 1 },
        }),
      }),
    },
    stopWhen: isStepCount(4),
    output: Output.object({
      schema: z.object({ character: z.string(), eyeColor: z.string() }),
    }),
  });

  console.log(
    "steps:",
    result.steps.length,
    "toolCalls in step1:",
    result.steps[0]?.toolCalls?.length ?? 0,
  );
  console.log("structured output:", JSON.stringify(result.output));
  const ok = result.output?.eyeColor?.toLowerCase().includes("gray");
  console.log(ok ? "PASS: tool loop + Output.object works" : "FAIL: unexpected output");
}

async function main() {
  await spikeCaching();
  await spikeToolLoopAndOutput();
}

main().catch((err) => {
  console.error("SPIKE FAILED:", err);
  process.exit(1);
});
