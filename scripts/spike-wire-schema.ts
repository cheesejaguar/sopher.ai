/**
 * Proves the fix for the 2026-08-04 authoring incident against the live gateway.
 *
 * The premise of the whole change is that Anthropic's structured-output path
 * strips numeric/length bounds and does not enforce z.enum, so a permissive
 * wire schema plus a local normalizer is the only way a review can be relied on
 * to come back usable. That premise is worth exactly nothing until a real
 * provider call confirms it, because the same rewriting that drops our bounds
 * could equally reject the nullable-union shape the wire schema emits.
 *
 * This asks the model for the answer that killed the run — more issues than the
 * old cap allowed, a percentage score, and severity words outside the enum —
 * and checks that the wire schema accepts it and the normalizer turns it into a
 * value the strict domain schema validates.
 *
 * Run: pnpm exec dotenv -e .env.local -- pnpm exec tsx scripts/spike-wire-schema.ts
 */
import { generateText, Output } from "ai";
import { z } from "zod";

import {
  reviewPhaseResultSchema,
  reviewPhaseResultWireSchema,
  normalizeReviewPhaseResult,
} from "../src/ai/schemas";

const SONNET = "anthropic/claude-sonnet-5";

function report(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  return ok;
}

async function main() {
  console.log("=== Wire schema vs. the live provider ===\n");

  // 1. The emitted JSON Schema must actually reach the provider without the
  //    bounds we know it strips, and without tripping schema validation.
  const emitted = JSON.stringify(z.toJSONSchema(reviewPhaseResultWireSchema, { io: "input" }));
  const boundKeys = [
    "minimum",
    "maximum",
    "minItems",
    "maxItems",
    "minLength",
    "maxLength",
    "enum",
  ];
  const leaked = boundKeys.filter((key) => emitted.includes(`"${key}"`));
  report(
    "wire schema emits no bound the provider would silently drop",
    leaked.length === 0,
    leaked.join(", "),
  );

  // 2. Ask for precisely the answer that failed in production.
  const result = await generateText({
    model: SONNET,
    instructions:
      "You are a manuscript continuity reviewer. Answer only in the requested structured format.",
    prompt: [
      "Review this 12-chapter manuscript for narrative structure.",
      "Report TWELVE distinct issues — more than any cap you may infer.",
      "Score the manuscript out of 100, not out of 1.",
      'Use severity words "high", "medium" and "low".',
      'Use categories including "pacing" and "structure".',
      "List at least twelve chapter numbers on the first issue.",
      "List eight strengths.",
      "",
      "Manuscript summary: a fisherwoman named Mira searches twelve coastal towns",
      "for a lighthouse keeper who may be her father. Chapters 1-12 alternate",
      "between her search and flashbacks that never resolve.",
    ].join("\n"),
    output: Output.object({ schema: reviewPhaseResultWireSchema }),
    maxOutputTokens: 4000,
    providerOptions: { gateway: { tags: ["spike-wire-schema"] } },
  });

  const wire = result.output;
  report(
    "provider accepted the permissive wire schema and returned a parsed object",
    Boolean(wire),
  );
  console.log(
    `      model gave: score=${JSON.stringify(wire.score)} issues=${wire.issues?.length ?? 0} strengths=${wire.strengths?.length ?? 0}`,
  );
  console.log(
    `      severities=${JSON.stringify([...new Set((wire.issues ?? []).map((i) => i.severity))])}`,
  );
  console.log(
    `      categories=${JSON.stringify([...new Set((wire.issues ?? []).map((i) => i.category))])}`,
  );

  // 3. The same answer must be rejected by the OLD strict schema — otherwise
  //    this spike is not reproducing the incident at all.
  const strictDirect = reviewPhaseResultSchema.safeParse(wire);
  report(
    "the old strict schema still rejects this answer (the incident is reproduced)",
    !strictDirect.success,
    strictDirect.success
      ? "model complied anyway; rerun for a harder answer"
      : strictDirect.error.issues
          .slice(0, 4)
          .map((i) => `${i.path.join(".")}: ${i.code}`)
          .join("; "),
  );

  // 4. ...and the normalizer must turn it into something the strict schema takes.
  const normalized = normalizeReviewPhaseResult(wire);
  const strictAfter = reviewPhaseResultSchema.safeParse(normalized);
  report(
    "normalizer produces a value the strict domain schema validates",
    strictAfter.success,
    strictAfter.success ? "" : JSON.stringify(strictAfter.error.issues.slice(0, 3)),
  );
  console.log(
    `      normalized: score=${normalized.score} issues=${normalized.issues.length} strengths=${normalized.strengths.length}`,
  );
  report(
    "the review survived with real findings rather than an empty shell",
    normalized.issues.length > 0 && normalized.summary.length > 0,
  );

  console.log(
    `\nusage: ${result.usage.inputTokens} in / ${result.usage.outputTokens} out, finishReason=${result.finishReason}`,
  );
}

main().catch((error) => {
  console.error("SPIKE FAILED:", error);
  process.exit(1);
});
