import { generateText, Output } from "ai";
import { z } from "zod";

import { anthropicCachedSystem } from "@/ai/cache";
import { gatewayOptions, metered, type MeterCtx } from "@/ai/metering";
import { meteredInputGuard, meteredMaxOutputTokens } from "@/ai/metering-limits";
import { MODELS, type QualityTier } from "@/ai/models";
import {
  buildProofreadUserPrompt,
  MAX_PROOFREAD_SUGGESTIONS,
  PROOFREAD_CATEGORIES,
  PROOFREAD_SYSTEM_PROMPT,
} from "@/ai/prompts/proofread";

export const PROOFREAD_OPERATION = "editor.proofread";

export type ProofreadChapterInput = {
  meter: MeterCtx;
  tier: QualityTier;
  chapterNumber: number;
  content: string;
};

export const proofreadSuggestionListSchema = z.object({
  corrections: z
    .array(
      z.object({
        anchorText: z
          .string()
          .min(12)
          .max(1_000)
          .describe("One whole sentence copied character for character from the chapter"),
        replacement: z
          .string()
          .min(1)
          .max(1_000)
          .describe("That same sentence with the error corrected"),
        rationale: z.string().describe("One line naming the error in plain words"),
        category: z.enum(PROOFREAD_CATEGORIES),
        severity: z.enum(["info", "warning", "error"]),
      }),
    )
    .max(MAX_PROOFREAD_SUGGESTIONS),
});

export type ProofreadSuggestionList = z.infer<typeof proofreadSuggestionListSchema>;
export type ProofreadCorrection = ProofreadSuggestionList["corrections"][number];

export type ResolvedProofreadCorrection = {
  correction: ProofreadCorrection;
  start: number;
  end: number;
  /** Ordinal among identical matches of anchorText (0 = first). */
  occurrence: number;
};

export type ProofreadAnchoring = {
  resolved: ResolvedProofreadCorrection[];
  /** Quotes that no longer appear, or whose duplicate slots are exhausted. */
  unanchored: number;
  /** Corrections rejected for rewriting the sentence rather than fixing it. */
  outOfScope: number;
};

/**
 * A substitution touching more than this share of the sentence is a rewrite,
 * whatever the model called it. Short sentences get the flat allowance so a
 * two-word fix in a five-word line is not mistaken for one.
 */
const MECHANICAL_CHANGE_RATIO = 0.25;
const MECHANICAL_CHANGE_FLOOR = 3;
/** Past this, the quote is not the single sentence the prompt asked for. */
const MAX_SENTENCE_TOKENS = 200;

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Longest common subsequence of two token lists. Same algorithm as the UI's
 * word diff, reduced to a length so the guard stays independent of display.
 */
function commonTokenCount(a: string[], b: string[]): number {
  const cols = b.length + 1;
  const table = new Uint16Array((a.length + 1) * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }
  return table[0];
}

/**
 * True when the correction is small enough to be a mechanical fix.
 *
 * The system prompt forbids rewriting, but a model that ignores it produces
 * exactly the failure this pass exists to avoid — the author's voice quietly
 * replaced under a "typo" label. Measure the change instead of trusting it.
 */
export function withinMechanicalScope(anchorText: string, replacement: string): boolean {
  if (!replacement.trim()) return false;
  if (replacement === anchorText) return false;

  const before = tokenize(anchorText);
  const after = tokenize(replacement);
  if (before.length === 0) return false;
  if (before.length > MAX_SENTENCE_TOKENS || after.length > MAX_SENTENCE_TOKENS) return false;

  const shared = commonTokenCount(before, after);
  // Deletions and insertions of the same word count as one substituted word:
  // fixing "there" to "their" changes one token, not two.
  const changed = Math.max(before.length - shared, after.length - shared);
  const allowed = Math.max(
    MECHANICAL_CHANGE_FLOOR,
    Math.ceil(before.length * MECHANICAL_CHANGE_RATIO),
  );
  return changed <= allowed;
}

/** Every start index of `needle`, enumerated the way findTextRange does. */
function anchorStarts(content: string, needle: string): number[] {
  const starts: number[] = [];
  for (let idx = content.indexOf(needle); idx !== -1; idx = content.indexOf(needle, idx + 1)) {
    starts.push(idx);
  }
  return starts;
}

/**
 * Locate each correction in the chapter and stamp its occurrence ordinal.
 *
 * A proofreading pass hits repeated sentences far more often than an editorial
 * one — stock dialogue beats, refrains, a duplicated paragraph — so resolving
 * every quote to the first match would pile several corrections onto one copy
 * and leave the rest untouched. Corrections claim occurrences in the order the
 * model returned them, which matches the prompt's "one entry per copy" rule
 * and the ordinal `SuggestionAnchor.occurrence` that the editor plugin reads.
 */
export function resolveProofreadAnchors(
  content: string,
  corrections: ProofreadCorrection[],
): ProofreadAnchoring {
  const claimed = new Map<string, number>();
  const resolved: ResolvedProofreadCorrection[] = [];
  let unanchored = 0;
  let outOfScope = 0;

  for (const correction of corrections) {
    // Checked before anchoring so a rewrite cannot consume a duplicate's slot.
    if (!withinMechanicalScope(correction.anchorText, correction.replacement)) {
      outOfScope += 1;
      continue;
    }
    const starts = anchorStarts(content, correction.anchorText);
    const occurrence = claimed.get(correction.anchorText) ?? 0;
    if (occurrence >= starts.length) {
      unanchored += 1;
      continue;
    }
    claimed.set(correction.anchorText, occurrence + 1);
    resolved.push({
      correction,
      start: starts[occurrence],
      end: starts[occurrence] + correction.anchorText.length,
      occurrence,
    });
  }

  return { resolved, unanchored, outOfScope };
}

/**
 * Mechanical-correctness pass over one chapter: a single structured call on
 * the cheap tier model returning whole-sentence corrections the author accepts
 * or rejects individually. Deliberately knows nothing about the book — style,
 * outline, and continuity are none of a proofreader's business.
 */
export async function proofreadChapter(
  input: ProofreadChapterInput,
): Promise<ProofreadSuggestionList> {
  const model = MODELS[input.tier].lineEdit;

  const result = await metered(
    input.meter,
    { role: "editor", operation: PROOFREAD_OPERATION, model },
    () =>
      generateText({
        model,
        instructions: anthropicCachedSystem(PROOFREAD_SYSTEM_PROMPT),
        prompt: buildProofreadUserPrompt({
          chapterNumber: input.chapterNumber,
          chapterContent: input.content,
        }),
        maxOutputTokens: meteredMaxOutputTokens(PROOFREAD_OPERATION),
        prepareStep: meteredInputGuard(PROOFREAD_OPERATION),
        output: Output.object({ schema: proofreadSuggestionListSchema }),
        providerOptions: gatewayOptions(input.meter, "editor"),
      }),
  );

  return result.output;
}
